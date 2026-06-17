// NATIVE `vl fmt` SCALE — formatting a large file must stay roughly linear. The
// formatter had several O(n²) hotspots (running `s = s + …` string accumulators
// in joinOut / joinLines / normalizeProgram, and per-node linear scans in lineOf
// and exportPrefix). On the 6940-line compiler/typecheck.vl they exhausted the
// compiler instance's non-freeing (null-collector) heap — a wasm trap
// "allocation size too large" — or ran for minutes. This formats a ~7000-line
// file and asserts it COMPLETES (exit 0, non-empty, idempotent) well within a
// generous budget; the quadratic forms would crash or time out.
//
// GATING: same as tests/selfhost_native_align_test.ts — env-gated
// (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed wasm.

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

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) console.warn("[vl-fmt-scale] skipped — missing vl binary or seed wasm.");

const fmt = async (file: string): Promise<{ code: number; out: string }> => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["fmt", file, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return { code, out: new TextDecoder().decode(stdout) };
};

Deno.test({
  name: "vl-fmt-scale: a ~7000-line file formats (no O(n²) crash/hang) and is idempotent",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_scale_" });
    try {
      // ~2300 functions with longish names → ~6900 lines, the size that tripped
      // the heap before the fix.
      let src = "";
      for (let i = 0; i < 2300; i++) {
        src += `function someLongishFunctionName${String(i).padStart(5, "0")}(argumentOne: i32): i32 {\n  argumentOne + ${i}\n}\n`;
      }
      src += "print(0)\n";
      const f = `${dir}/big.vl`;
      await Deno.writeTextFile(f, src);

      const t0 = Date.now();
      const r = await fmt(f);
      const secs = (Date.now() - t0) / 1000;
      if (r.code !== 0) throw new Error(`fmt failed on a large file (code ${r.code}) — likely the O(n²) regression`);
      if (r.out.length < src.length / 2) throw new Error(`fmt produced suspiciously little output (${r.out.length} bytes)`);
      // Generous: the fix runs this in a couple of seconds; the quadratic forms
      // took minutes. 30s leaves wide headroom for slow CI without masking a regression.
      if (secs > 30) throw new Error(`fmt took ${secs}s on a large file — O(n²) regression suspected`);

      // Idempotent.
      const f2 = `${dir}/big2.vl`;
      await Deno.writeTextFile(f2, r.out);
      const r2 = await fmt(f2);
      if (r2.out !== r.out) throw new Error("fmt not idempotent on a large file");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
