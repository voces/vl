// `-O`/`-O3` KEEP HOT CALLEES OUT OF RUN-ONCE CODE (lane L8 of
// `docs/internals/perf-decoder-gap-2026-09.md`; DECISIONS.md, "`-O3` keeps hot callees out of
// run-once code").
//
// V8 tiers a wasm function up to its optimizing compiler only at the function's next call, so
// code that runs once — the start function, and a `main()` it calls once — stays on the
// baseline tier. Binaryen inlines a single-caller function into its caller, which moved hot
// loop bodies into the start function and made plumb's decoder 1.7x slower under V8 at `-O3`.
// The host now passes `--no-inline=<f>` for every callee that only run-once code calls, from a
// loop. What is pinned here is that SHAPE — the start function still makes a call from inside
// a loop — at both rungs, with the program's output unchanged. A timing cannot be gated in CI.
//
// The CONTROL runs the same passes without the marks and must find the call gone: otherwise a
// fixture binaryen would not have inlined anyway passes whether or not the marks exist.
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

const DIR = `${ROOT}/tests/fixtures/opt-runonce`;
const FIXTURES = ["top-level-loop", "main-wrapper"];

// The start function's body in a `wasm-dis` dump, or "" when the module has none.
const startBody = (wat: string): string => {
  const m = /^ \(start \$(\S+)\)$/m.exec(wat);
  if (!m) return "";
  const lines = wat.split("\n");
  const at = lines.findIndex((l) =>
    l === ` (func $${m[1]}` || l.startsWith(` (func $${m[1]} `)
  );
  if (at < 0) return "";
  const end = lines.findIndex((l, i) => i > at && l.startsWith(" (func "));
  return lines.slice(at + 1, end < 0 ? lines.length : end).join("\n");
};

// Does a direct `call` sit lexically inside a `loop` of this body? `wasm-dis` nests folded
// instructions by indent, so a loop's extent is the lines indented deeper than its opener.
const callsInsideALoop = (body: string): number => {
  const loops: number[] = [];
  let n = 0;
  for (const line of body.split("\n")) {
    const indent = line.length - line.trimStart().length;
    while (loops.length && indent <= loops[loops.length - 1]) loops.pop();
    const t = line.trimStart();
    if (t.startsWith("(loop")) loops.push(indent);
    else if (loops.length && /^\((return_)?call \$/.test(t)) n++;
  }
  return n;
};

const run = async (bin: string, args: string[]) => {
  const p = await new Deno.Command(bin, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: p.code, out: dec.decode(p.stdout), err: dec.decode(p.stderr) };
};

for (const fx of FIXTURES) {
  Deno.test({
    name:
      `native-release: run-once code keeps its hot callee out of line — ${fx}`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${DIR}/${fx}.vl`;
      const want = logsOf(Deno.readTextFileSync(src));
      const tmp = await Deno.makeTempDir();
      try {
        for (const rung of ["-O", "-O3"]) {
          const out = `${tmp}/m${rung}.wasm`;
          const b = await vl(["build", src, rung, "--wat", "-o", out]);
          if (b.code !== 0) {
            throw new Error(`${fx} ${rung}: vl build failed: ${b.err.trim()}`);
          }
          const body = startBody(Deno.readTextFileSync(`${tmp}/m${rung}.wat`));
          if (!body) {
            throw new Error(`${fx} ${rung}: no start function in the dump`);
          }
          if (callsInsideALoop(body) === 0) {
            throw new Error(
              `${fx} ${rung}: the hot callee was inlined into the start function\n` +
                "  want: a `call` inside the start function's loop (the callee kept out of line)\n" +
                "  got:  no call inside any loop — V8 will run that loop body on its baseline tier",
            );
          }
          const r = await vl(["run", out]);
          const got = r.out.replace(/\n$/, "").split("\n");
          if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(want)) {
            throw new Error(
              `${fx} ${rung}: want ${JSON.stringify(want)}, got ${
                JSON.stringify(got)
              } rc=${r.code}`,
            );
          }
        }

        // CONTROL: the release passes WITHOUT the marks inline the callee away.
        const mainRs = Deno.readTextFileSync(
          `${ROOT}/scripts/vl-host/src/main.rs`,
        );
        const features = rustList(mainRs, "BINARYEN_FEATURES");
        const plain = `${tmp}/plain.wasm`;
        const b = await vl(["build", src, "-o", plain]);
        if (b.code !== 0) {
          throw new Error(`${fx}: plain vl build failed: ${b.err.trim()}`);
        }
        const opt = await run(WASM_OPT, [
          plain,
          ...rustList(mainRs, "RELEASE_PASSES"),
          ...features,
          "-o",
          `${tmp}/c.wasm`,
        ]);
        if (opt.code !== 0) {
          throw new Error(`${fx}: control wasm-opt failed: ${opt.err.trim()}`);
        }
        const dis = await run(WASM_DIS, [`${tmp}/c.wasm`, ...features]);
        if (callsInsideALoop(startBody(dis.out)) !== 0) {
          throw new Error(
            `${fx}: CONTROL — the release passes without --no-inline kept the call, so this\n` +
              "  fixture no longer exercises the marks; give its callee a shape binaryen inlines",
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}
