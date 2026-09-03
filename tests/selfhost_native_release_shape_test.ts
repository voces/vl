// The BENCHMARK SHAPE rows of the release suite (`SHAPE_TABLE`). Its own file so
// `deno test --parallel` can run it beside the melt/loop/case rows rather than
// after them; the machinery and the table are in the shared support module.
import {
  BENCH,
  BYTES_TOL_FRAC,
  BYTES_TOL_MIN,
  ENABLED,
  SHAPE_TABLE,
  exact,
  shapeOf,
  vl,
} from "./support/nativeRelease.ts";

for (const row of SHAPE_TABLE) {
  Deno.test({
    name: `native-release: bench/${row.bench} — emitted shape (${row.axis})`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${BENCH}/${row.bench}/main.vl`;
      const tmp = await Deno.makeTempDir();
      try {
        for (const [label, flags, want] of [
          ["-O", ["-O"], row.O],
          ["-O3", ["-O3"], row.O3],
        ] as const) {
          const out = `${tmp}/m.wasm`;
          // `vl build` validates the module it writes, so exit 0 already means wasmtime
          // accepts these bytes — the programs themselves are far too large to run here.
          const b = await vl(["build", src, ...flags, "--wat", "-o", out]);
          if (b.code !== 0) {
            throw new Error(
              `bench/${row.bench}: vl build ${label} failed: ${b.err.trim().split("\n")[0]}`,
            );
          }
          const bytes = Deno.statSync(out).size;
          const got = shapeOf(Deno.readTextFileSync(`${tmp}/m.wat`), bytes, want);

          // Structure is graded FIRST: a structural move takes the bytes with it, and the
          // structural message names the cause where the byte message can only name the
          // symptom.
          if (JSON.stringify(exact(got)) !== JSON.stringify(exact(want))) {
            throw new Error(
              `bench/${row.bench} ${label}: emitted shape moved\n` +
                `  want ${JSON.stringify(exact(want))}\n  got  ${JSON.stringify(exact(got))}\n` +
                "  fns UP: something stopped inlining — a per-iteration call frame.\n" +
                "  allocs UP: an allocation the optimizer used to melt is back.\n" +
                "  indirect UP: a direct call went through the table (~13ns vs ~0.9ns);\n" +
                "    indirect DOWN on algorithms/dispatch-table means a dynamic target was\n" +
                "    wrongly devirtualised, which is a soundness question, not a win.\n" +
                "  tail DOWN: the tail-call emitter stopped firing — 2.06x AND a stack-depth\n" +
                "    cap back at ~16k frames instead of 5M.\n" +
                "  refEq DOWN: `__str_eq__` lost its identity fast path — 2.1x on an equal-key\n" +
                "    probe loop, and user code cannot spell a replacement.\n" +
                "  A move in the FAST direction is a finding, not a break: re-measure and\n" +
                "  update SHAPE_TABLE + the row's justification in the same change.",
            );
          }

          const tol = Math.max(BYTES_TOL_MIN, Math.round(want.bytes * BYTES_TOL_FRAC));
          if (Math.abs(bytes - want.bytes) > tol) {
            throw new Error(
              `bench/${row.bench} ${label}: module size ${want.bytes} -> ${bytes} bytes ` +
                `(band ±${tol})\n` +
                "  The structural counts above are unchanged, so this is per-instruction\n" +
                "  weight, not a lost inline or a lost DCE. GREW: extra work emitted into\n" +
                "  code that was already there, or a helper started unrolling. SHRANK: check\n" +
                "  the hot loop was not constant-folded away — a benchmark that measures\n" +
                "  nothing is the worse failure. Re-measure and update SHAPE_TABLE with the\n" +
                "  reason. Editing this benchmark's main.vl is expected to move this row.",
            );
          }
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}
