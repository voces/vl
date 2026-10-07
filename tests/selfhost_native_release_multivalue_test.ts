// `-O`/`-O3` RETURN A SMALL RECORD AS MULTI-VALUE WHERE THE CALLER ONLY READS IT (D3625; the
// owner's ruling (B), DECISIONS.md "`-O` returns a small record's fields as multi-value").
//
// The host's multi-value step gives a producer a twin returning its record's fields, and a
// call site whose result does not escape calls the twin. Pinned here, per fixture and rung:
// the optimized module prints the unoptimized build's `@log` lines, and
//
// * `melts`: the `struct.new` sites left in function bodies are the fixture's `@allocs` (0
//   when it names none: a global's initializer is not a function body). Its CONTROL builds
//   the same rung with the step turned off (`$VL_OPT_NO_MULTIVALUE`) and must find more, so
//   the fixture exercises this step and not the escape step or binaryen alone;
// * `kept`: the step writes no twin (the record is past its field bound);
// * `output`: only the output is pinned (records that escape, recursion, and the twin
//   parameter cap).
//
// @test-timing opt
import {
  ENABLED,
  logsOf,
  ROOT,
  rustList,
  vl,
  WASM_DIS,
} from "./support/nativeRelease.ts";

const DIR = `${ROOT}/tests/fixtures/opt-multivalue`;
type Want = "melts" | "kept" | "output";
const FIXTURES: [string, Want][] = [
  ["heap-held", "melts"],
  ["subtyped", "melts"],
  ["supertype-producer", "output"],
  ["escapes", "output"],
  ["recursion", "output"],
  ["over-bound", "kept"],
  ["wide-argument", "melts"],
  ["if-merge", "melts"],
  ["fallback-local", "melts"],
  ["twin-param-cap", "output"],
];
const RUNGS = ["-O", "-O3"];

// `struct.new` sites in function bodies: a global's initializer runs once and is not counted.
const allocations = (wat: string): number => {
  let inFunc = false, n = 0;
  for (const line of wat.split("\n")) {
    if (line.startsWith(" (")) inFunc = line.startsWith(" (func ");
    if (inFunc) n += line.match(/\(struct\.new/g)?.length ?? 0;
  }
  return n;
};

// Functions with more than one result: the twins the step wrote.
const twinsIn = (wat: string): number =>
  [...wat.matchAll(/^ \(func .*\(result \S+ \S+/gm)].length;

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

const mainRs = () =>
  Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`);

for (const [fx, want] of FIXTURES) {
  Deno.test({
    name: `native-release: a small record comes back as multi-value — ${fx}`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${DIR}/${fx}.vl`;
      const text = Deno.readTextFileSync(src);
      const logs = logsOf(text);
      const allocs = Number(text.match(/^\/\/ @allocs (\d+)$/m)?.[1] ?? 0);
      const features = rustList(mainRs(), "BINARYEN_FEATURES");
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
          JSON.stringify(linesOf(r0.out)) !== JSON.stringify(logs)
        ) {
          throw new Error(
            `${fx}: the unoptimized build no longer prints the fixture's @log lines\n` +
              `  want: ${JSON.stringify(logs)}\n  got:  ${
                JSON.stringify(linesOf(r0.out))
              } rc=${r0.code}`,
          );
        }
        for (const rung of RUNGS) {
          const dump = `${tmp}/step${rung}.wasm`;
          const built = async (step: boolean) => {
            const out = `${tmp}/m${rung}${step ? "" : "-off"}.wasm`;
            const b = await vl(["build", src, rung, "-o", out], {
              VL_OPT_NO_MULTIVALUE: step ? "" : "1",
              VL_OPT_MV_DUMP: step ? dump : "",
            });
            if (b.code !== 0) {
              throw new Error(
                `${fx} ${rung}: vl build failed: ${b.err.trim()}`,
              );
            }
            const r = await vl(["run", out]);
            const got = linesOf(r.out);
            if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(logs)) {
              throw new Error(
                `${fx} ${rung}${
                  step ? "" : " (step off)"
                }: the optimized module ` +
                  `prints something else\n  want: ${JSON.stringify(logs)}\n` +
                  `  got:  ${JSON.stringify(got)} rc=${r.code} ${r.err.trim()}`,
              );
            }
            return allocations((await run(WASM_DIS, [out, ...features])).out);
          };
          const left = await built(true);
          if (want === "melts" && left !== allocs) {
            throw new Error(
              `${fx} ${rung}: ${left} struct.new left in the optimized module\n` +
                `  want: ${allocs} — every call here only reads the record it gets\n` +
                "  got:  more, so some call site kept a record as a struct",
            );
          }
          let twins = 0;
          try {
            twins = twinsIn((await run(WASM_DIS, [dump, ...features])).out);
          } catch {
            // No dump: the step changed nothing.
          }
          if ((want === "kept") !== (twins === 0)) {
            throw new Error(
              `${fx} ${rung}: the step wrote ${twins} multi-value twin(s)\n` +
                (want === "kept"
                  ? "  want: none — the record is past the step's field bound"
                  : "  want: at least one — some call site here only reads its record"),
            );
          }
          if (want === "melts" && await built(false) <= allocs) {
            throw new Error(
              `${fx} ${rung}: CONTROL — with the step off no more struct.new is left,\n` +
                "  so this fixture no longer exercises the step; give its producers a record\n" +
                "  type some heap location holds, as sunpa's are",
            );
          }
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

// A rewrite that does not validate is dropped and the input kept: `$VL_MV_FAULT=1` corrupts
// the step's output, and the build must still succeed and print the plain output, with no
// step output written.
Deno.test({
  name:
    "native-release: a multi-value rewrite that does not validate is dropped",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${DIR}/heap-held.vl`;
    const logs = logsOf(Deno.readTextFileSync(src));
    const tmp = await Deno.makeTempDir();
    try {
      const dump = `${tmp}/step.wasm`;
      const out = `${tmp}/m.wasm`;
      const b = await vl(["build", src, "-O", "-o", out], {
        VL_MV_FAULT: "1",
        VL_OPT_MV_DUMP: dump,
      });
      if (b.code !== 0) {
        throw new Error(`build with a faulted step failed: ${b.err.trim()}`);
      }
      const r = await vl(["run", out]);
      const got = linesOf(r.out);
      if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(logs)) {
        throw new Error(
          `want ${JSON.stringify(logs)}, got ${
            JSON.stringify(got)
          } rc=${r.code}`,
        );
      }
      let wrote = true;
      try {
        Deno.statSync(dump);
      } catch {
        wrote = false;
      }
      if (wrote) {
        throw new Error(
          "want no step output: the faulted rewrite should be dropped",
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// A twin carries its function's name with `.mv` after it, so a trap inside one reads as the
// function it came from in a `--names` build. Read off the step's own output.
Deno.test({
  name: "native-release: a multi-value twin is named after its function",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${DIR}/heap-held.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      const dump = `${tmp}/step.wasm`;
      const b = await vl(
        ["build", src, "-O", "--names", "-o", `${tmp}/m.wasm`],
        { VL_OPT_MV_DUMP: dump },
      );
      if (b.code !== 0) throw new Error(`build: ${b.err.trim()}`);
      const features = rustList(mainRs(), "BINARYEN_FEATURES");
      const dis = await run(WASM_DIS, [dump, ...features]);
      const funcs = [...dis.out.matchAll(/^ \(func \$(\S+)/gm)].map((m) =>
        m[1]
      );
      const twins = funcs.filter((f) => f.endsWith(".mv"));
      if (!twins.some((f) => f.startsWith("qnorm@"))) {
        throw new Error(
          "want a twin of `qnorm` named `qnorm@….mv`\n" +
            `  got: ${funcs.join(", ")}`,
        );
      }
      const multi = [
        ...dis.out.matchAll(/^ \(func \$(\S+) .*\(result (?:f64 ?){3,}\)/gm),
      ];
      if (multi.length === 0) {
        throw new Error("want a twin with three or more f64 results; got none");
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

// `$VL_MV_EXPLAIN=1` says, per record type and per producer, why the step took it or not, and
// changes nothing it writes. In `subtyped`, V3 is a declared subtype of Pt and Particle has
// V3's shape and is written: the report must name V3 a candidate and Particle's writer.
Deno.test({
  name: "native-release: VL_MV_EXPLAIN names each refusal and changes no byte",
  ignore: !ENABLED,
  fn: async () => {
    const src = `${DIR}/subtyped.vl`;
    const tmp = await Deno.makeTempDir();
    try {
      const build = async (explain: boolean) => {
        const dump = `${tmp}/step${explain ? "-x" : ""}.wasm`;
        const b = await vl(
          ["build", src, "-O3", "--names", "-o", `${tmp}/m.wasm`],
          { VL_OPT_MV_DUMP: dump, VL_MV_EXPLAIN: explain ? "1" : "" },
        );
        if (b.code !== 0) throw new Error(`build: ${b.err.trim()}`);
        return { err: b.err, bytes: Deno.readFileSync(dump) };
      };
      const off = await build(false);
      const on = await build(true);
      if (off.err.includes("mv-explain")) {
        throw new Error(
          `want no report without the variable; got:\n${off.err}`,
        );
      }
      if (
        off.bytes.length !== on.bytes.length ||
        off.bytes.some((b, i) => b !== on.bytes[i])
      ) {
        throw new Error(
          "want the step's output byte-identical with VL_MV_EXPLAIN on and off",
        );
      }
      const wants = [
        /mv-explain: type \d+ \{f64, f64, f64\} \(returned by add@\S+, scale@\S+\): candidate/,
        /mv-explain: type \d+ \{f64, f64, f64\} .*refused: its fields are written \(struct\.set \d+ in drift@/,
        /mv-explain: add@\S+ -> type \d+: result twin; \d+ call site\(s\) read it as fields/,
      ];
      for (const w of wants) {
        if (!w.test(on.err)) {
          throw new Error(
            `want a report line matching ${w}\n  got:\n${on.err}`,
          );
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
