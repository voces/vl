// The LOOP-SHAPE rows of the release suite (`LOOP_TABLE`) and the `-O3` @log
// replay over `CASES_LIST`. Their own file so `deno test --parallel` can run
// them beside the shape/melt rows; the machinery is in the shared support module.
import {
  CASES,
  CASES_LIST,
  ENABLED,
  LOOPS,
  LOOP_TABLE,
  buildAndCount,
  logsOf,
  vl,
} from "./support/nativeRelease.ts";

// THE LOOP-ROTATION REGRESSION GATE. `vl build -O3` (and `-O`) is a LOSS on tight
// scalar loops under wasmtime — 2.43x on `bench/arith/mixed-width`, 1.23x on
// `bench/arrays/binsearch` — and the cause is not in the flag set: bare binaryen
// `-O` at any level produces it, `--closed-world`/`--gufa` alone produce none of
// it, and no combination both melts allocations and leaves the loop alone.
//
// Since it cannot be fixed by choosing flags, it is PINNED, so that a future flag
// change cannot make it quietly worse. Timing in CI is not a usable instrument;
// the loop SHAPE is, because it is what the slowdown was traced to.
for (const row of LOOP_TABLE) {
  Deno.test({
    name: `native-release: ${row.fixture} — loop shape (loops,rotated,carried) stays ${
      row.none.join("/")
    } → ${row.O.join("/")} → ${row.O3.join("/")}`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${LOOPS}/${row.fixture}.vl`;
      const want = logsOf(Deno.readTextFileSync(src));
      const tmp = await Deno.makeTempDir();
      try {
        const got: Record<string, [number, number, number]> = {};
        for (const [label, flags] of [["none", []], ["-O", ["-O"]], ["-O3", ["-O3"]]] as const) {
          const r = await buildAndCount(src, [...flags], tmp);
          got[label] = r.shape;
          if (JSON.stringify(r.out) !== JSON.stringify(want)) {
            throw new Error(
              `${row.fixture}: ${label} changed behavior\n  want ${JSON.stringify(want)}\n  got  ${
                JSON.stringify(r.out)
              }`,
            );
          }
        }
        const wantT = { none: row.none, "-O": row.O, "-O3": row.O3 };
        if (JSON.stringify(got) !== JSON.stringify(wantT)) {
          throw new Error(
            `${row.fixture}: loop shape moved — (loops, rotated, carried)\n` +
              `  want ${JSON.stringify(wantT)}\n  got  ${JSON.stringify(got)}\n` +
              "  MORE rotated loops, or a HIGHER carried count on a rotated loop, means\n" +
              "  this program got slower under wasmtime: the rotated shape costs a register\n" +
              "  shuffle per loop edge plus a spill of the widest loop-carried value, and the\n" +
              "  cost grades by `carried` (measured 1.00x at 1, 1.36x at 2, 2.40x at 3).\n" +
              "  FEWER is a finding, not a break — re-measure and update LOOP_TABLE +\n" +
              "  docs/internals/opt-profile-design.md §7 in the same change.\n" +
              "  A `none` row that gained a rotated loop is worse still: that is VL's own\n" +
              "  emitter regressing, and the default build has no flag to escape it.",
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

for (const rel of CASES_LIST) {
  Deno.test({
    name: `native-release: ${rel} — vl build -O3 stays valid + reproduces @log`,
    ignore: !ENABLED,
    fn: async () => {
      const srcPath = new URL(rel, CASES).pathname;
      const want = logsOf(Deno.readTextFileSync(new URL(rel, CASES)));
      const tmp = await Deno.makeTempDir();
      try {
        const plain = `${tmp}/plain.wasm`;
        const rel3 = `${tmp}/rel.wasm`;
        const bp = await vl(["build", srcPath, "-o", plain]);
        if (bp.code !== 0) throw new Error(`${rel}: vl build failed: ${bp.err.trim().split("\n")[0]}`);
        // `vl build` validates the written module, so a non-zero exit here already
        // means the release profile produced something wasmtime refuses.
        const br = await vl(["build", srcPath, "-O3", "-o", rel3]);
        if (br.code !== 0) throw new Error(`${rel}: vl build -O3 failed: ${br.err.trim().split("\n")[0]}`);

        const pSize = Deno.statSync(plain).size, rSize = Deno.statSync(rel3).size;
        if (rSize <= 0) throw new Error(`${rel}: -O3 produced an empty module`);
        if (rSize > pSize) throw new Error(`${rel}: -O3 grew the module (${pSize} → ${rSize} bytes)`);

        const r = await vl(["run", rel3]);
        if (r.code !== 0) {
          throw new Error(`${rel}: vl run <rel.wasm> exited ${r.code}: ${r.err.trim().split("\n")[0]}`);
        }
        const got = r.out.length ? r.out.replace(/\n$/, "").split("\n") : [];
        if (JSON.stringify(got) !== JSON.stringify(want)) {
          throw new Error(
            `${rel}: -O3 changed behavior\n  want ${JSON.stringify(want)}\n  got  ${JSON.stringify(got)}`,
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}
