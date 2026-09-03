# Profiling the compiler

`VL_PROFILE_GUEST=<out.json>` runs a compile under a sampling guest profiler (~1 ms epoch
interrupts, `compile_vl_guest_profiled` in `scripts/vl-host/src/main.rs`) and writes a
Firefox-profiler JSON. Frames read `wasm-function[N]` unless the SEED carries a name section,
so build the seed with `--names` first — and profile with that seed, never ship it.

```sh
vl build compiler/entry.vl -o /tmp/names.wasm --names --compiler build/vl-compiler.wasm
VL_PROFILE_GUEST=/tmp/p.json vl build compiler/entry.vl -o /tmp/o.wasm --compiler /tmp/names.wasm
python3 scripts/profile-rank.py /tmp/p.json 20      # rank by SELF time
```

Notes, each of which cost something to learn:

* **The profiled run bypasses the `.cwasm` sidecar** (epoch instrumentation is a different
  engine config), so it pays ~10 s re-JITing the compiler no matter how small the input.
  That fixed cost is why the merge-gate guard is
  `tests/vl_scaling_shape_test.ts`'s ratio and not a profiler run.
* **Rank by SELF time, not inclusive.** A whole-arena scan called from one place shows up as
  ~all self; a dispatcher shows up as ~all inclusive. `profile-rank.py` prints both.
* **`__str_eq__` high in the list is a symptom, not a site** — it is the name-keyed
  registries (`isUName`, `variantIndexOf`, `declaredSlotOf`, `__map_probe__`) doing linear
  lookups. `python3 scripts/profile-rank.py` has a sibling idiom: rank the immediate PARENT
  frame of every sample whose leaf is a given function, to find whose loop it is.
* **`VL_STD=<worktree>/std`** on every worktree probe — the host resolves `std:` from the
  BINARY's checkout, which is the main repo's.

## Measured 2026-09-02 (#2419)

Self-compile before the memo, 28,755 guest samples: `moduleHasUnionAs` 29.8% self time and
`moduleHasNumCast` 29.4% — each a whole-arena scan asked once per emitted function (4,399
functions, no union-`as` in the compiler, so every scan ran to the end) — and
`fieldClosureFeOfRecv` 12.8%, scanning to prove an answer `fnValUsed` already gave. After:
master's source compiles in 11 s by the memoised compiler versus 43 s by master's own fixpoint
at load 13 (116 s → 6 s on an idle box), byte-identical output.

## Guards

Three, and they fire at different moments. Profiling is what you do AFTER one of them does.

* **`tests/vl_scaling_shape_test.ts`** — seven pairs, the same work reshaped along one axis
  (functions, types, unions, call sites, closures, modules, generic pins), graded on the
  TIME RATIO so machine speed and box load cancel. Fires when a pass starts multiplying
  over an axis, and NAMES the axis. ~16–25 s; two of its seven red on the pre-#2419
  compiler. Three axes are super-linear today and carry a bar above their measurement, each
  naming the function responsible — read those comments before widening a bar.
* **`arena-scan-outside-pass`** (compiler/lint.vl) with `scripts/scan-budget.py`'s ratchet —
  a loop bounded by a whole-program table inside a function that is neither a pass nor
  allow-listed. Fires at REVIEW time, before the cost exists: 132 stand today, and the
  per-file count may only fall. A scan resuming from a memo is exempt, since that is the fix.
* **`scripts/self-compile-time.sh`** — the candidate compiling the compiler, in CPU seconds
  against `scripts/self-compile-baseline.json` (6.3 s idle), tripping past 4×. Fires when the
  other two missed it. HALF the factor pays for contention — the same build reads 12.2–12.7 s
  inside a fanned-out `gate.sh` at load 164 — which is why the band is not 2×. It says only
  that the bootstrap got dearer; the shape family says where.
