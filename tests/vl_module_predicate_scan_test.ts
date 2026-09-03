// A MODULE-WIDE PREDICATE MUST NOT BE RE-DERIVED PER EMITTED FUNCTION.
//
// `moduleHasUnionAs` / `moduleHasNumCast` (emit_classify.vl) each scanned the WHOLE arena
// and `emitFuncCode` asked both once per function, so the compiler compiling itself spent
// 59% of its wall clock on two booleans — and the worst case is a module with no such node,
// because then every scan runs to the end. `fieldClosureFeOfRecv` was a third of the same
// shape. Profile: `scripts/profile-rank.py`, method in docs/internals/profiling-the-compiler.md.
//
// THE NET, and why it is a ratio rather than a budget: two programs with the same statement
// count, one folded into 20x fewer functions. Total lowering work is ~equal, so a per-function
// module scan is the only thing that can separate them — and process startup, machine speed
// and box load all cancel. Measured 2026-09-02: 4.3x before the fix, 1.1x after.
const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) console.warn("[module-predicate-scan] skipped — missing vl binary or seed wasm.");

// `fns` functions of `stmts` statements each, plus a fixed 40-call driver so both
// sides of the pair carry the same top-level statement count.
const gen = (fns: number, stmts: number): string => {
  const out: string[] = [];
  for (let i = 0; i < fns; i++) {
    out.push(`function f${i}(k: i32): i32 {`, "  let t = k");
    for (let j = 0; j < stmts; j++) out.push(`  t = t + ${j % 13} * k - ${j % 7}`);
    out.push("  t", "}");
  }
  out.push("let acc = 0");
  for (let i = 0; i < 40; i++) out.push(`acc = acc + f${i}(${i % 5})`);
  out.push("print(acc)");
  return out.join("\n") + "\n";
};

const build = async (src: string, out: string): Promise<number> => {
  const t0 = Date.now();
  const { code, stderr } = await new Deno.Command(VL, {
    args: ["build", src, "-o", out, "--compiler", COMPILER],
    stdout: "null",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  if (code !== 0) {
    throw new Error(`vl build failed on ${src}: ${new TextDecoder().decode(stderr).slice(0, 400)}`);
  }
  return (Date.now() - t0) / 1000;
};

Deno.test({
  name:
    "module predicates are not re-derived per emitted function (20x the functions, same work)",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_modpred_" });
    try {
      const many = `${dir}/many.vl`;
      const few = `${dir}/few.vl`;
      await Deno.writeTextFile(many, gen(800, 20));
      await Deno.writeTextFile(few, gen(40, 400));

      let tMany = await build(many, `${dir}/many.wasm`);
      let tFew = await build(few, `${dir}/few.wasm`);

      // 2.5 splits the measured 1.1x from the measured 4.3x with room on both sides.
      // The 0.4s floor on the denominator keeps a sub-second run from making the ratio
      // hypersensitive to one scheduler spike, and a suspicious ratio is re-measured
      // once with the per-side minimum taken — a spike does not repeat, a quadratic does.
      const RATIO = 2.5;
      const bad = (f: number, m: number) => m > RATIO * Math.max(f, 0.4);
      if (bad(tFew, tMany)) {
        const tMany2 = await build(many, `${dir}/many.wasm`);
        const tFew2 = await build(few, `${dir}/few.wasm`);
        tMany = Math.min(tMany, tMany2);
        tFew = Math.min(tFew, tFew2);
      }
      if (bad(tFew, tMany)) {
        throw new Error(
          `800 functions cost ${tMany}s but the SAME statements in 40 functions cost ${tFew}s ` +
            `(> ${RATIO}x): a module-wide predicate is being re-derived per emitted function. ` +
            `Profile with docs/internals/profiling-the-compiler.md and memoise it the way ` +
            `moduleHasUnionAs does (emit_classify.vl), clearing the memo in emitProgram.`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
