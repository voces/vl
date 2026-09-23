// THE GC-HEAP-SIZING REGRESSION GUARD — a live-set-churn shape, graded by COLLECTION
// COUNT rather than wall clock, so the assertion is machine-independent.
//
// wasmtime's copying collector grows its GC heap only once the live set nearly fills a
// semispace, and every collection re-copies the whole live set. So the user-program
// store's INITIAL heap (`RUN_GC_HEAP_INITIAL`, scripts/vl-host/src/main.rs) decides how
// often a program with a large live set pays that copy.
// docs/internals/perf/gc-heap-policy-2026-09.md has the measurements and the choice.
//
// The fixture holds a LIVE table of 400,000 three-field structs (a few MB, plumb's
// decoder's order of magnitude) and makes 12,000,000 short-lived allocations through
// it. Collection counts are deterministic for a given compiler and host; measured when
// the default became 256 MiB: 222 at an initial size of 0 (before #3022), 20 at 64 MiB
// (#3022's default), 7 at 128 MiB, 3 at 256 MiB.
//
// Three runs grade it. The DEFAULT must collect at least once (a fired control, so a
// dead counter cannot pass) and at most a loose `MAX_DEFAULT`. `VL_GC_HEAP=64M` must collect at
// least `MIN_SPREAD` times as often as the default: that is the relative check that
// survives an emitter change resizing the structs, and it proves the override is live.
// And an unparsable `VL_GC_HEAP` must be a hard error, not a quiet default.
//
// `VL_GC: "auto"` is pinned in the spawn env rather than left to the ambient environment:
// `none` or `refcount` never run the copying collector at all, which reads as "0
// collections", the same shape as a dead counter.
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
    `[gc-heap-shape] skipped — ${
      !haveBin ? "missing vl binary" : "missing seed wasm"
    }. Build:\n` +
      "  (cd scripts/vl-host && cargo build --release)\n" +
      "  scripts/fetch-seed.sh",
  );
}

const SRC = `import { toString } from "std:fmt"

type Cell = { a: i32, b: i32, c: i32 }

const LIVE = 400_000
const CHURN = 12_000_000

const keep: Cell[] = []
for i in 0 until LIVE { keep.push({ a: i, b: i + 1, c: i + 2 }) }

let s = 0
for i in 0 until CHURN {
  const t: Cell = { a: i, b: i & 7, c: 1 }
  s += t.a + t.b + keep[i % LIVE].c
}
print("sum " + s.toString())
`;

const EXPECT = "sum -1664468608\n";

// 3 at the shipped 256 MiB, 222 at 0. Loose on purpose so a change in object size cannot
// red it; MIN_SPREAD is the check that tells 256 MiB from a smaller default.
const MAX_DEFAULT = 10;
// 20 / 3 at the time of writing; 128 MiB as the default gives 20 / 7 and fails it.
const MIN_SPREAD = 3;

async function run(tmp: string, env: Record<string, string>) {
  const srcPath = `${tmp}/churn.vl`;
  await Deno.writeTextFile(srcPath, SRC);
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["run", srcPath, "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ VL_GC: "auto", VL_GC_STATS: "1", ...env }),
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
}

async function collections(
  tmp: string,
  env: Record<string, string>,
  label: string,
): Promise<number> {
  const { code, out, err } = await run(tmp, env);
  if (code !== 0) {
    throw new Error(
      `${label}: vl run exited ${code}\nstdout: ${out}\nstderr: ${err}`,
    );
  }
  if (out !== EXPECT) {
    throw new Error(
      `${label}: stdout mismatch\n  want ${JSON.stringify(EXPECT)}\n  got  ${
        JSON.stringify(out)
      }`,
    );
  }
  const m = err.match(/^vl: gc collections: (\d+)$/m);
  if (!m) {
    throw new Error(
      `${label}: no "vl: gc collections: N" line on stderr — $VL_GC_STATS=1 did not fire.\nstderr: ${err}`,
    );
  }
  return Number(m[1]);
}

Deno.test({
  name:
    "gc-heap-shape: a multi-MB live set collects rarely at the default initial heap",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const n = await collections(tmp, {}, "default heap");
      if (n < 1) {
        throw new Error(
          `${n} collections at the default heap — the counter looks dead (the control this ` +
            "test relies on did not fire; see maybe_install_gc_stats in scripts/vl-host/src/main.rs)",
        );
      }
      if (n > MAX_DEFAULT) {
        throw new Error(
          `${n} collections at the default heap, want <= ${MAX_DEFAULT} — the user-program GC ` +
            "heap's initial size has regressed (RUN_GC_HEAP_INITIAL in scripts/vl-host/src/main.rs; " +
            "docs/internals/perf/gc-heap-policy-2026-09.md). 256 MiB gives 3, 64 MiB gives 20.",
        );
      }
      const small = await collections(
        tmp,
        { VL_GC_HEAP: "64M" },
        "VL_GC_HEAP=64M",
      );
      if (small < n * MIN_SPREAD) {
        throw new Error(
          `VL_GC_HEAP=64M collected ${small} times against the default's ${n}, want at least ` +
            `${MIN_SPREAD}x — either the override is not reaching the engine or the default ` +
            "is no longer larger than 64 MiB",
        );
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});

Deno.test({
  name: "gc-heap-shape: an unparsable VL_GC_HEAP is a hard error",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      for (const bad of ["12Q", "M", "-1", "5G"]) {
        const { code, err } = await run(tmp, { VL_GC_HEAP: bad });
        if (code === 0 || !err.includes("VL_GC_HEAP")) {
          throw new Error(
            `VL_GC_HEAP=${bad}: want a non-zero exit naming $VL_GC_HEAP, got exit ${code}\nstderr: ${err}`,
          );
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
