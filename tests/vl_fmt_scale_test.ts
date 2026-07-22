// NATIVE `vl fmt` SCALE — formatting a large file must stay roughly linear. The
// formatter had several O(n²) hotspots (running `s = s + …` string accumulators
// in joinOut / joinLines / normalizeProgram, and per-node linear scans in lineOf
// and exportPrefix). On the 6940-line compiler/typecheck.vl they exhausted the
// compiler instance's non-freeing (null-collector) heap — a wasm trap
// "allocation size too large" — or ran for minutes.
//
// Detection is TWO nets, on a half-size (~1725-line) and a full (~3450-line)
// fixture:
//   1. ABSOLUTE: the big file must format at all (exit 0, sane output, well
//      under a generous 30s budget) — the historical quadratic forms took
//      minutes at this size (~130s CI-scaled) or crashed outright.
//   2. SCALING RATIO: doubling the input must not ~quadruple the time. The
//      linear formatter measures 2.0x ± a few % per doubling; any quadratic
//      term big enough to matter pushes it toward 4x. This is MORE sensitive
//      than the old single-file 30s budget (it trips on mild quadratics the
//      absolute budget would mask), machine-speed independent, and what lets
//      the fixture shrink from ~7000 lines without losing the regression net.
//      To keep CI-noise flakes out, a suspicious ratio is re-measured once and
//      the per-size minimums are compared (a scheduler spike doesn't repeat).
// Plus idempotency: re-formatting the formatted output must be a fixed point.
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

const fmt = async (file: string): Promise<{ code: number; out: string; secs: number }> => {
  const t0 = Date.now();
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["fmt", file, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1" },
  }).output();
  return { code, out: new TextDecoder().decode(stdout), secs: (Date.now() - t0) / 1000 };
};

// ~3 lines per function with longish names — `count` functions ≈ 3·count lines,
// the shape that tripped the non-freeing heap before the fix.
const genSource = (count: number): string => {
  let src = "";
  for (let i = 0; i < count; i++) {
    src += `function someLongishFunctionName${String(i).padStart(5, "0")}(argumentOne: i32): i32 {\n  argumentOne + ${i}\n}\n`;
  }
  src += "print(0)\n";
  return src;
};

Deno.test({
  name: "vl-fmt-scale: a ~3500-line file formats linearly (no O(n²) crash/hang) and is idempotent",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_fmt_scale_" });
    try {
      const half = `${dir}/half.vl`; // ~1725 lines
      const big = `${dir}/big.vl`; // ~3450 lines
      const bigSrc = genSource(1150);
      await Deno.writeTextFile(half, genSource(575));
      await Deno.writeTextFile(big, bigSrc);

      const check = (r: { code: number; out: string }, label: string, srcLen: number) => {
        if (r.code !== 0) throw new Error(`fmt failed on the ${label} file (code ${r.code}) — likely the O(n²) regression`);
        if (r.out.length < srcLen / 2) throw new Error(`fmt produced suspiciously little output on the ${label} file (${r.out.length} bytes)`);
      };

      // Timed runs, half then full size (serial, so the timings don't contend).
      let rHalf = await fmt(half);
      check(rHalf, "half-size", bigSrc.length / 2);
      let rBig = await fmt(big);
      check(rBig, "large", bigSrc.length);

      // Net 1 — absolute: the linear formatter runs the big file in a couple of
      // seconds even on slow CI; the historical quadratic forms took minutes at
      // this size or crashed. 30s leaves wide headroom without masking those.
      if (rBig.secs > 30) throw new Error(`fmt took ${rBig.secs}s on a large file — O(n²) regression suspected`);

      // Net 2 — scaling: 2x input must stay near 2x time (measured 2.0x ± a few
      // %); a quadratic term pushes toward 4x. Bound 3.0 splits the two. The
      // 0.1s floor on the denominator keeps the ratio meaningful when a fast
      // machine formats the half file quicker than timers resolve. A failing
      // ratio is re-measured once (min of the two runs per size) so a one-off
      // CI scheduler spike on the big run cannot flake the suite.
      const RATIO = 3.0;
      const scaled = (h: number, b: number) => b > RATIO * Math.max(h, 0.1);
      if (scaled(rHalf.secs, rBig.secs)) {
        const rHalf2 = await fmt(half);
        check(rHalf2, "half-size", bigSrc.length / 2);
        const rBig2 = await fmt(big);
        check(rBig2, "large", bigSrc.length);
        rHalf = rHalf.secs <= rHalf2.secs ? rHalf : rHalf2;
        rBig = rBig.secs <= rBig2.secs ? rBig : rBig2;
      }
      if (scaled(rHalf.secs, rBig.secs)) {
        throw new Error(
          `fmt scales superlinearly: ${rHalf.secs}s (~1725 lines) -> ${rBig.secs}s (~3450 lines), ` +
            `> ${RATIO}x for 2x input — O(n²) regression suspected`,
        );
      }

      // Idempotent on the large output.
      const big2 = `${dir}/big2.vl`;
      await Deno.writeTextFile(big2, rBig.out);
      const r2 = await fmt(big2);
      if (r2.out !== rBig.out) throw new Error("fmt not idempotent on a large file");
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
