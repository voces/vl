// `-O`/`-O3` INLINE THE HELPERS A PER-CALL STRUCT IS PASSED TO (lane L4 of
// `docs/internals/perf/decode-bench-gap-2026-09.md`; DECISIONS.md, "`-O` inlines the helpers a
// per-call struct is passed to").
//
// binaryen's `--heap2local` keeps an allocation off the GC heap only when it never leaves its
// function, so a state struct handed to small helpers stays on the heap unless every helper is
// inlined first. The host now runs a step before each rung that inlines exactly those helpers.
// Pinned here, per fixture and rung: the program's output is the unoptimized build's, and the
// fixtures whose structs never escape carry no `struct.new` at all.
//
// The CONTROL runs each rung's passes without the step and must find a `struct.new` left:
// otherwise a fixture binaryen would have scalarised anyway passes whether or not the step
// exists. `escapes.vl` is output-only — its structs are returned, captured and stored, so
// their allocations must survive. `cycle-helpers.vl` is BOUNDED: its helpers call one another
// in a cycle, which the step must leave alone, so each optimized module stays within
// `MAX_GROWTH` times the plain build (inlining the cycle unrolled it to hundreds of KB).
//
// @test-timing opt
import {
  ENABLED,
  logsOf,
  ROOT,
  rustList,
  vl,
  WASM_DIS,
  WASM_OPT,
} from "./support/nativeRelease.ts";

const DIR = `${ROOT}/tests/fixtures/opt-escape`;
// fixture -> whether every struct it allocates stays off the heap once the step has run
const FIXTURES: [string, boolean][] = [
  ["state-helpers", true],
  ["identity-alias", true],
  ["escapes", false],
  ["cycle-helpers", false],
];
const BOUNDED = new Set(["cycle-helpers"]);
const MAX_GROWTH = 2;
const RUNGS: [string, string][] = [["-O", "OPT_PASSES"], [
  "-O3",
  "RELEASE_PASSES",
]];

const allocations = (wat: string): number =>
  (wat.match(/\(struct\.new/g) ?? []).length;

const run = async (bin: string, args: string[]) => {
  const p = await new Deno.Command(bin, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: p.code, out: dec.decode(p.stdout), err: dec.decode(p.stderr) };
};

const linesOf = (out: string) => out.replace(/\n$/, "").split("\n");

for (const [fx, melts] of FIXTURES) {
  Deno.test({
    name: `native-release: a per-call struct's helpers are inlined — ${fx}`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${DIR}/${fx}.vl`;
      const want = logsOf(Deno.readTextFileSync(src));
      const tmp = await Deno.makeTempDir();
      try {
        const plain = `${tmp}/plain.wasm`;
        const b0 = await vl(["build", src, "-o", plain]);
        if (b0.code !== 0) {
          throw new Error(`${fx}: plain vl build failed: ${b0.err.trim()}`);
        }
        const r0 = await vl(["run", plain]);
        if (
          r0.code !== 0 ||
          JSON.stringify(linesOf(r0.out)) !== JSON.stringify(want)
        ) {
          throw new Error(
            `${fx}: the unoptimized build no longer prints the fixture's @log lines\n` +
              `  want: ${JSON.stringify(want)}\n  got:  ${
                JSON.stringify(linesOf(r0.out))
              } rc=${r0.code}`,
          );
        }
        const mainRs = Deno.readTextFileSync(
          `${ROOT}/scripts/vl-host/src/main.rs`,
        );
        const features = rustList(mainRs, "BINARYEN_FEATURES");
        for (const [rung, passes] of RUNGS) {
          const out = `${tmp}/m${rung}.wasm`;
          const b = await vl(["build", src, rung, "--wat", "-o", out]);
          if (b.code !== 0) {
            throw new Error(`${fx} ${rung}: vl build failed: ${b.err.trim()}`);
          }
          const r = await vl(["run", out]);
          const got = linesOf(r.out);
          if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(want)) {
            throw new Error(
              `${fx} ${rung}: the optimized module prints something else\n` +
                `  want: ${JSON.stringify(want)}\n  got:  ${
                  JSON.stringify(got)
                } rc=${r.code}`,
            );
          }
          if (BOUNDED.has(fx)) {
            const plainSize = Deno.statSync(plain).size;
            const size = Deno.statSync(out).size;
            if (size > MAX_GROWTH * plainSize) {
              throw new Error(
                `${fx} ${rung}: the optimized module is ${size} bytes against ${plainSize} plain\n` +
                  `  want: at most ${MAX_GROWTH}x — no helper in a call cycle may be inlined\n` +
                  "  got:  a cycle was inlined and unrolled",
              );
            }
          }
          if (!melts) continue;
          const left = allocations(
            Deno.readTextFileSync(`${tmp}/m${rung}.wat`),
          );
          if (left !== 0) {
            throw new Error(
              `${fx} ${rung}: ${left} struct.new left in the optimized module\n` +
                "  want: 0 — every struct here is per-call state that no heap location can hold\n" +
                "  got:  an allocation binaryen kept, so a helper it is passed to was not inlined",
            );
          }
          // CONTROL: the rung's own passes, without the step, leave the allocation in place.
          const c = `${tmp}/c${rung}.wasm`;
          const opt = await run(WASM_OPT, [
            plain,
            ...rustList(mainRs, passes),
            ...features,
            "-o",
            c,
          ]);
          if (opt.code !== 0) {
            throw new Error(
              `${fx} ${rung}: control wasm-opt failed: ${opt.err.trim()}`,
            );
          }
          const dis = await run(WASM_DIS, [c, ...features]);
          if (allocations(dis.out) === 0) {
            throw new Error(
              `${fx} ${rung}: CONTROL — the rung's passes alone already removed every struct.new,\n` +
                "  so this fixture no longer exercises the step; give its helpers a shape binaryen\n" +
                "  does not inline on its own",
            );
          }
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

// The step renames every function to mark it, then gives each its own name back: a `--names`
// build leaves the step with the names it came in with and none of the markers, and a build
// without names leaves it with none. Read off the step's own output (`$VL_OPT_ESCAPE_DUMP`),
// since the rung that follows decides separately whether the final module keeps names.
Deno.test({
  name:
    "native-release: the escape step hands every function its own name back",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${DIR}/state-helpers.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      const mainRs = Deno.readTextFileSync(
        `${ROOT}/scripts/vl-host/src/main.rs`,
      );
      const features = rustList(mainRs, "BINARYEN_FEATURES");
      for (
        const [flags, named] of [[["--names"], true], [[], false]] as [
          string[],
          boolean,
        ][]
      ) {
        const dump = `${tmp}/step${named ? "-named" : ""}.wasm`;
        const b = await vl([
          "build",
          src,
          "-O",
          ...flags,
          "-o",
          `${tmp}/m.wasm`,
        ], {
          VL_OPT_ESCAPE_DUMP: dump,
        });
        if (b.code !== 0) throw new Error(`build ${flags}: ${b.err.trim()}`);
        let dis;
        try {
          dis = await run(WASM_DIS, [dump, ...features]);
        } catch {
          throw new Error(
            `${flags}: no step output at ${dump} — the step did not run`,
          );
        }
        const funcs = [...dis.out.matchAll(/^ \(func \$(\S+)/gm)].map((m) =>
          m[1]
        );
        if (funcs.length === 0) {
          throw new Error(`${flags}: the step's output has no functions`);
        }
        const markers = funcs.filter((f) => /^L4[cn]\./.test(f));
        if (markers.length) {
          throw new Error(
            `${flags}: marker names left after the step: ${markers.join(", ")}`,
          );
        }
        const scan = funcs.some((f) => f.startsWith("scan@"));
        if (scan !== named) {
          throw new Error(
            `${flags}: want the function \`scan\` ${
              named ? "named" : "unnamed"
            } after the step\n` +
              `  got: ${funcs.join(", ")}`,
          );
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
