// WHICH ITERATION the hoisted list-header guard traps on, including inside unrolled copies.
//
// The header hoist (`loopHoistOpen`, compiler/wasmEmit.vl) caches a list's
// backing and `len` above a loop whose only calls are linear-memory intrinsics.
// The bound it compares against is therefore read once instead of per access,
// and the thing that must not move is WHEN the guard first refuses.
//
// The corpus `@trap` directive cannot see that: it inspects the abort, and the
// oracle skips the log assertion whenever a case traps. So the corpus file pins
// THAT the loop still traps and this file pins WHERE — the printed prefix names
// every round that completed, so an off-by-one in the cached bound shows as a
// missing or an extra line rather than as a passing test.
//
// The witness is the corpus case itself, run rather than retyped: a paraphrase
// is a different program.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) and needs the built binary plus
// the seed; absent either, the case registers as ignored.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn(
    "[hoist-trap-iteration] skipped — missing vl binary or seed wasm.",
  );
}

// Each case's stdout before its trap. `hoist-out-of-range-traps`: `xs` holds three elements, so
// rounds 1, 2 and 3 complete and round 4 traps at `xs[3]`. The partial-unroll cases trap inside
// a copied body — in a main trip's second copy, in the rolled remainder, and in a list walk's
// copy — and the field case reads one past a cached `b.xs` under `to len`. A trailing `99` is
// what each program prints if it ever finishes.
const CASES: [string, string[]][] = [
  ["tests/cases/loops/hoist-out-of-range-traps.vl", ["1", "2", "3", "4"]],
  [
    "tests/cases/traps/partial-unroll-trap-in-main-copy.vl",
    ["1", "31810", "2", "-687413116", "3", "-1332001594", "4"],
  ],
  [
    "tests/cases/traps/partial-unroll-trap-in-remainder.vl",
    ["1", "1026", "2", "947656708", "3"],
  ],
  [
    "tests/cases/traps/partial-unroll-walk-trap-in-body.vl",
    ["1", "-380381002", "2", "-371145792", "3"],
  ],
  ["tests/cases/traps/field-list-to-length-traps.vl", ["1"]],
];

for (const [CASE, WANT] of CASES) {
  Deno.test({
    name: `the bounds guard traps on the round that first exceeds len: ${CASE}`,
    ignore: !ENABLED,
    fn: async () => {
      const { code, stdout } = await new Deno.Command(VL, {
        args: ["run", `${ROOT}/${CASE}`, "--compiler", COMPILER],
        stdout: "piped",
        stderr: "piped",
        cwd: ROOT,
        env: nativeEnv({ NO_COLOR: "1" }),
        clearEnv: true,
      }).output();
      const out = new TextDecoder().decode(stdout);
      if (code === 0) {
        throw new Error(
          `${CASE} exited 0 — the out-of-range read was not refused.\n` +
            `  stdout: ${JSON.stringify(out)}`,
        );
      }
      const lines = out.split("\n").filter((l) => l.length > 0);
      if (JSON.stringify(lines) !== JSON.stringify(WANT)) {
        throw new Error(
          `${CASE} trapped on the wrong round.\n` +
            `  want stdout lines: ${JSON.stringify(WANT)}\n` +
            `  got:               ${JSON.stringify(lines)}`,
        );
      }
    },
  });
}
