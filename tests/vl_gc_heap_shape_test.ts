// THE C1 REGRESSION GUARD — a live-set-churn shape, graded by COLLECTION COUNT
// rather than wall clock, so the assertion is machine-independent.
//
// docs/internals/perf-decoder-gap-2026-09.md: wasmtime's copying collector grows
// its GC heap only once the live set nearly fills a semispace, so a store that
// starts at 0 collects every few MiB of allocation. #3022 fixed it for `vl run`
// by starting the user-program engine's heap at 64 MiB (`RUN_GC_HEAP_INITIAL`,
// scripts/vl-host/src/main.rs). None of `bench/`'s existing kernels or
// `tests/support/nativeRelease.ts`'s suite could have caught this — their live
// sets are tiny (the report's own §"Why no benchmark saw it").
//
// The fixture holds a LIVE table of 50,000 three-field structs (matching the
// report's §3 table, where that size gives the widest collection-count spread)
// and then makes 1,000,000 short-lived allocations in a loop, each one reading
// through the live table so it cannot be hoisted out. `$VL_GC_STATS=1` (a debug
// facility added alongside the fixture) counts wasmtime's copying-collection
// cycles via its own trace log and prints them on exit — see `maybe_install_gc_stats`.
//
// Measured on this box: 1 collection at the shipped 64 MiB initial heap, 149 at
// an initial size of 0 (the pre-#3022 setting, built to an isolated target-dir
// and run against the same fixture — never the shared binary, per CLAUDE.md).
// The bound below sits at 20: comfortably above the single collection the fix
// produces (a fired CONTROL, not a silent probe — CLAUDE.md, "never trust a
// probe until a control you KNOW should trigger it does") and 7x under the
// regressed count, so ordinary run-to-run variance cannot cross it either way.
//
// `VL_GC: "auto"` is pinned in the spawn env (nativeEnv's idiom, alongside VL_STD /
// VL_COMPILER_WASM) rather than left to the ambient environment: `none` or `refcount`
// never run the copying collector at all, which reads as "0 collections" — the same
// shape as the counter being dead — and would misdirect a real regression's own message.
//
// GATING: requires the vl binary + seed wasm; absent either, the test registers
// ignored with a one-line how-to-build note.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, VL } from "./support/tree.ts";

const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const ENABLED = haveBin && haveSeed;
if (!ENABLED) {
  console.warn(
    `[gc-heap-shape] skipped — ${!haveBin ? "missing vl binary" : "missing seed wasm"}. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh",
  );
}

// LIVE=50,000 held structs, CHURN=1,000,000 short-lived ones — a scaled-down
// spelling of the report's §3 reproduction (there: LIVE=50,000, CHURN=20M),
// sized so the whole test stays well under a second rather than matching
// `bench/collections/live-set-churn`'s ~1s sizing.
const SRC = `import { toString } from "std:fmt"

type Cell = { a: i32, b: i32, c: i32 }

const LIVE = 50_000
const CHURN = 1_000_000

const keep: Cell[] = []
for i in 0 until LIVE { keep.push({ a: i, b: i + 1, c: i + 2 }) }

let s = 0
for i in 0 until CHURN {
  const t: Cell = { a: i, b: i & 7, c: 1 }
  s += t.a + t.b + keep[i % LIVE].c
}
print("sum " + s.toString())
`;

const EXPECT = "sum 1018489888\n";

// A fired control (>=1) plus 7x headroom under the regressed count (149,
// measured against the 0-initial-heap variant) — see the header.
const MIN_COLLECTIONS = 1;
const MAX_COLLECTIONS = 20;

Deno.test({
  name: "gc-heap-shape: live-set churn collects rarely at the fixed initial heap (PL-014 lane L7)",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const srcPath = `${tmp}/churn.vl`;
      await Deno.writeTextFile(srcPath, SRC);
      const { code, stdout, stderr } = await new Deno.Command(VL, {
        args: ["run", srcPath, "--compiler", COMPILER],
        stdout: "piped",
        stderr: "piped",
        env: nativeEnv({ VL_GC: "auto", VL_GC_STATS: "1" }),
      }).output();
      const out = new TextDecoder().decode(stdout);
      const err = new TextDecoder().decode(stderr);
      if (code !== 0) {
        throw new Error(`vl run exited ${code}\nstdout: ${out}\nstderr: ${err}`);
      }
      if (out !== EXPECT) {
        throw new Error(`stdout mismatch\n  want ${JSON.stringify(EXPECT)}\n  got  ${JSON.stringify(out)}`);
      }
      const m = err.match(/^vl: gc collections: (\d+)$/m);
      if (!m) {
        throw new Error(
          `no "vl: gc collections: N" line on stderr — $VL_GC_STATS=1 did not fire.\nstderr: ${err}`,
        );
      }
      const n = Number(m[1]);
      if (n < MIN_COLLECTIONS) {
        throw new Error(
          `${n} collections — below ${MIN_COLLECTIONS}, so the counter itself looks dead ` +
            "(the control this test relies on did not fire; see maybe_install_gc_stats in " +
            "scripts/vl-host/src/main.rs)",
        );
      }
      if (n > MAX_COLLECTIONS) {
        throw new Error(
          `${n} collections, want <= ${MAX_COLLECTIONS} — the user-program GC heap's initial ` +
            "size has regressed (RUN_GC_HEAP_INITIAL in scripts/vl-host/src/main.rs; " +
            "docs/internals/perf-decoder-gap-2026-09.md C1). 149 collections is what the " +
            "pre-#3022 setting (initial size 0) produces on this same fixture.",
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
