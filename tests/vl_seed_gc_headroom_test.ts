// THE SEED-SIDE GC GUARD — how often the compiler seed's copying heap collects on a `vl check`
// whose live set passes through the top quarter of a semispace, graded by COLLECTION COUNT,
// which is deterministic for a given seed and host, rather than by wall clock.
//
// wasmtime grows a copying heap only when one request cannot fit after a collection, so a live
// set just under a semispace collects every few KiB. The host doubles the seed's heap after any
// collection leaving more than 75% of a semispace live (`SeedGcHeadroom`,
// scripts/vl-host/src/main.rs; docs/internals/perf/gc-heap-policy-2026-09.md §4).
//
// The workload is `vl check compiler/emit_base.vl` at the default first heap (128 MiB a
// semispace), whose live set passes the 96 MiB the policy grows at: 4 and 26 collections on
// 2026-10-31. The default heap is the engine configuration every other compile shares, so its
// `.cwasm` is already warm; a pinned heap was its own configuration and re-JITted the seed
// (about 13 s) on every new seed. Three bounds: the default
// collects at least once (a dead counter reads 0) and at most `MAX_DEFAULT`; the policy switched
// off collects more than `MAX_DEFAULT`, the red control run in the same test; and off collects at
// least `MIN_SPREAD` times as often, so a workload that drifts out of the band fails here.
//
// GATING: requires the vl binary + seed wasm; absent either, the test registers ignored.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const ENABLED = exists(VL) && exists(COMPILER);
if (!ENABLED) {
  console.warn(
    "[seed-gc-headroom] skipped — missing the vl binary or the seed wasm. Build:\n" +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh",
  );
}

const TARGET = `${ROOT}/compiler/emit_base.vl`;

// 4 at the time of writing; loose so a compiler change that moves the live set cannot red it.
const MAX_DEFAULT = 12;
// 26 / 4 at the time of writing.
const MIN_SPREAD = 3;

async function collections(grow: string, label: string): Promise<number> {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", TARGET, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    // The collector and first heap are pinned, not inherited: a caller that sourced
    // scripts/self-compile-gc.sh starts at 2 GiB, where this live set never nears a semispace.
    // An empty heap is the default, and the default's warm engine configuration.
    env: nativeEnv({
      VL_GC_STATS: "1",
      VL_COMPILE_GC: "copying",
      VL_COMPILE_GC_HEAP: "",
      VL_COMPILE_GC_GROW: grow,
    }),
  }).output();
  const out = new TextDecoder().decode(stdout);
  const err = new TextDecoder().decode(stderr);
  if (code !== 0) {
    throw new Error(
      `${label}: vl check exited ${code}\nstdout: ${out}\nstderr: ${err}`,
    );
  }
  const m = err.match(/^vl: compile gc collections: (\d+),/m);
  if (!m) {
    throw new Error(
      `${label}: no "vl: compile gc collections: N" line on stderr — $VL_GC_STATS=1 did not fire.\nstderr: ${err}`,
    );
  }
  return Number(m[1]);
}

Deno.test({
  name:
    "seed-gc-headroom: a seed live set near a semispace grows the heap instead of re-collecting",
  ignore: !ENABLED,
  fn: async () => {
    const n = await collections("", "default policy");
    if (n < 1) {
      throw new Error(
        `${n} collections with the default policy — the counter looks dead (GcStatsLog in ` +
          "scripts/vl-host/src/main.rs reads wasmtime's trace log)",
      );
    }
    if (n > MAX_DEFAULT) {
      throw new Error(
        `${n} collections with the default policy, want <= ${MAX_DEFAULT} — the seed's heap ` +
          "no longer grows on headroom (SeedGcHeadroom in scripts/vl-host/src/main.rs; " +
          "gc-heap-policy-2026-09.md §4). A wasmtime bump that changed its grow predicate or " +
          "the three trace messages GC_LOG_TARGETS reads makes the policy a no-op.",
      );
    }
    const off = await collections("off", "VL_COMPILE_GC_GROW=off");
    if (off <= MAX_DEFAULT || off < n * MIN_SPREAD) {
      throw new Error(
        `VL_COMPILE_GC_GROW=off collected ${off} times against the default's ${n}, want more ` +
          `than ${MAX_DEFAULT} and at least ${MIN_SPREAD}x — either the knob no longer reaches ` +
          "the policy, or the workload's live set no longer sits where the policy acts and " +
          "this test needs a larger target",
      );
    }
  },
});
