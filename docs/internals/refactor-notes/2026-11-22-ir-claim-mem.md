# The `mem` family is claimed (IR-C1)

`RMemAccess`, `RMemOp`, `RSimd`, `RAtomic` and `RTruncSat` leave the `other` family for a new
family `mem` (`IrFamily`, `irRhsFamily`, `klIrFamily` in `compiler/lint.vl`), and `CLAIMED`
gains `mem`. The family list is family-grained, so a split is how kinds are admitted without
admitting the rest of `other`. Mode 3 (claim every family but `other`) now covers `mem` too.
There is no new admission predicate.

**The hazard this waited on.** On master, admitting `RMemAccess` alone made 10
`tests/cases/intrinsics/memarg-const-fold-*.vl` programs differ, and a hand-written SIMD twin did
the same. `memAddrPlanOf`'s `fold` arm reads `maFoldRowOf`, a table `emitMemConstFoldLet` fills
only while legacy emits a qualifying `const p = K + bounded`. Armed, legacy runs first and the
builder misses on `fold`. Claimed, the table is empty, the plan answers `rest`, and the IR ships the
unfolded spelling (`v128.store (local.get $p)` for legacy's `v128.store offset=1024
(local.get $scratch)`). #9511 (IR-N7) misses the whole function on `fnMemAddrFoldCount > 0`, which
is decided before either path runs. This PR stacks on it.

Why the kinds were in `other`: each was added shadow-only, so its coverage PR moved no shipped byte
(IR-N7; the notes 2026-11-20-ir-mem-access, ir-simd-v128 and 2026-11-21-ir-intr-residue).

## Readings (fixpoint seeds on both sides)

`--cases` and `--claimless` were read on 18e6bb72 over #9511's 737a8eaa. The rest were read on the
clean merge with #9511's head c9ecbd1b (62db826a), against c9ecbd1b's fixpoint.

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7614, fail under both 68, differ 0, timeout 0; witnesses same 60, differ 0 |
| `ir-identity.sh --claimless` | identical 14018, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45028 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 44878 corpus functions emitted by the IR, 19125 over 4981 filed witnesses; no fallback |
| L2 self-compile fuel per PR | +0.00% on 110337565646 |
| tests/cases claimed (mode 5, `fnc` rows) | 64140 → 67537 (+3,397 over 129 files, 0 lost) |

Released by directory: simd 1327, std 1131, modules 257, memory 253, loops 204, soundness 56, getters 36, unions 29, literal-unions 29, extern 29, intrinsics 19, atomics 10, numerics 6, run 3, functions 3, types 2, conditionals 2, expressions 1.

## Released per file (tests/cases)

```
   56  tests/cases/soundness/getter-name-field-keeps-sole-reference.vl
   56  tests/cases/simd/vector-map-of-vector-lists-runs.vl
   56  tests/cases/simd/vector-list-of-lists-runs.vl
   56  tests/cases/simd/vector-list-nullable-runs.vl
   56  tests/cases/simd/vector-list-in-union-runs.vl
   56  tests/cases/simd/vector-in-struct-runs.vl
   56  tests/cases/simd/vector-in-map-runs.vl
   56  tests/cases/simd/vector-in-generic-array-runs.vl
   56  tests/cases/simd/vector-in-array-runs.vl
   56  tests/cases/simd/vector-field-param-only-runs.vl
   56  tests/cases/simd/vector-annotated-empty-list-runs.vl
   56  tests/cases/simd/value-position-spill-of-effectful-place-runs.vl
   56  tests/cases/simd/lane-index-constant-range-loop.vl
   56  tests/cases/simd/getter-through-annotated-nullable-param-runs.vl
   56  tests/cases/simd/f32x4-std-surface.vl
   56  tests/cases/simd/f32x4-positions.vl
   56  tests/cases/simd/f32x4-lanes.vl
   56  tests/cases/simd/f32x4-lanes-own-names.vl
   56  tests/cases/simd/f32x4-kernel-vs-scalar.vl
   56  tests/cases/simd/f32x4-geometry.vl
   56  tests/cases/simd/f32x4-function-values.vl
   56  tests/cases/simd/coalesce-nullable-vector-list-cell-runs.vl
   56  tests/cases/simd/captured-reassigned-vector-cell.vl
   56  tests/cases/simd/assign-vector-field-through-element-value-runs.vl
   56  tests/cases/modules/ufcs-type-bound-past-inapplicable-local/entry.vl
   56  tests/cases/modules/ufcs-type-bound-applicable-local-wins/entry.vl
   33  tests/cases/memory/flat-lua-tvalue-accessors.vl
   33  tests/cases/memory/flat-fused-row-import/entry.vl
   33  tests/cases/memory/flat-fused-row-getter.vl
   33  tests/cases/memory/flat-fused-row-accessors.vl
   31  tests/cases/memory/flat-fused-row-one-accessor-set-two-containers.vl
   31  tests/cases/getters/getter-eval-order.vl
   30  tests/cases/memory/flat-fused-row-past-page-end-traps.vl
   30  tests/cases/loops/hoist-mem-intrinsic-body.vl
   29  tests/cases/unions/arm-with-buf-field-in-state-struct.vl
   29  tests/cases/std/process-exit-never-narrows.vl
   29  tests/cases/std/fs-write.vl
   29  tests/cases/std/fs-roundtrip.vl
   29  tests/cases/std/fs-range.vl
   29  tests/cases/std/fs-into.vl
   29  tests/cases/std/fs-append-text.vl
   29  tests/cases/std/buffer-window.vl
   29  tests/cases/std/buffer-window-past-end-traps.vl
   29  tests/cases/std/buffer-window-negative-traps.vl
   29  tests/cases/std/buffer-widths.vl
   29  tests/cases/std/buffer-views.vl
   29  tests/cases/std/buffer-view-write-past-end-traps.vl
   29  tests/cases/std/buffer-view-release-dangles.vl
   29  tests/cases/std/buffer-view-negative-index-traps.vl
   29  tests/cases/std/buffer-view-index-past-end-traps.vl
   29  tests/cases/std/buffer-view-extent-traps.vl
   29  tests/cases/std/buffer-view-extent-control.vl
   29  tests/cases/std/buffer-view-bracket.vl
   29  tests/cases/std/buffer-view-bounds-control.vl
   29  tests/cases/std/buffer-type-named-by-its-constructor.vl
   29  tests/cases/std/buffer-store8-past-memory-traps.vl
   29  tests/cases/std/buffer-store-bytes-overflow-traps.vl
   29  tests/cases/std/buffer-size-overflow-traps.vl
   29  tests/cases/std/buffer-release-below-base-traps.vl
   29  tests/cases/std/buffer-release-as-void-fn-value.vl
   29  tests/cases/std/buffer-release-above-pointer-traps.vl
   29  tests/cases/std/buffer-peak.vl
   29  tests/cases/std/buffer-negative-length-traps.vl
   29  tests/cases/std/buffer-narrow-stores.vl
   29  tests/cases/std/buffer-mark-release.vl
   29  tests/cases/std/buffer-load-bytes-overflow-traps.vl
   29  tests/cases/std/buffer-hoisted-negative-index-traps.vl
   29  tests/cases/std/buffer-hoisted-index-past-end-traps.vl
   29  tests/cases/std/buffer-hoisted-accessors.vl
   29  tests/cases/std/buffer-growth.vl
   29  tests/cases/std/buffer-bytes-roundtrip.vl
   29  tests/cases/std/buffer-bytes-file-staging.vl
   29  tests/cases/std/buffer-bulk.vl
   29  tests/cases/std/buffer-alloc.vl
   29  tests/cases/modules/ufcs-type-bound-at-hole-parameter/entry.vl
   29  tests/cases/modules/ufcs-not-imported-std-existing/entry.vl
   29  tests/cases/modules/root-exports-memory-name/entry.vl
   29  tests/cases/modules/read-only-callee-keeps-narrowing-any-entry/entry.vl
   29  tests/cases/modules/literal-binding-std-constant/entry.vl
   29  tests/cases/memory/flat-roundtrip-raw-addresses.vl
   29  tests/cases/loops/hoist-out-of-range-traps.vl
   29  tests/cases/loops/hoist-nested-two-arrays.vl
   29  tests/cases/loops/hoist-index-not-induction.vl
   29  tests/cases/loops/hoist-declines-on-rebinding.vl
   29  tests/cases/loops/hoist-declines-on-push.vl
   29  tests/cases/loops/hoist-declines-on-closure-call.vl
   29  tests/cases/literal-unions/litunion-order-cross-module-alias.vl
   29  tests/cases/extern/global-export-named-memory.vl
   15  tests/cases/simd/vector-function-values.vl
    7  tests/cases/intrinsics/dunder-intrinsic-as-value-positions.vl
    6  tests/cases/intrinsics/intrinsic-as-value.vl
    5  tests/cases/simd/float-pminmax.vl
    5  tests/cases/simd/float-convert.vl
    5  tests/cases/numerics/trunc-sat-positions.vl
    5  tests/cases/getters/getter-lane-over-v128.vl
    4  tests/cases/memory/store-narrow-widths-round-trip.vl
    4  tests/cases/memory/flat-fused-row-import/lib.vl
    3  tests/cases/simd/int-unary.vl
    3  tests/cases/simd/int-shift.vl
    3  tests/cases/simd/int-lanes.vl
    3  tests/cases/simd/int-binary.vl
    3  tests/cases/memory/load-zero-extend-fold-values.vl
    3  tests/cases/memory/load-width-in-named-fn.vl
    3  tests/cases/memory/intrinsic-inside-lambda-body.vl
    3  tests/cases/memory/bulk-copy-and-fill.vl
    3  tests/cases/intrinsics/memarg-offset-widths.vl
    3  tests/cases/functions/unconsumed-result-is-void.vl
    3  tests/cases/atomics/rmw.vl
    3  tests/cases/atomics/load-store.vl
    3  tests/cases/atomics/cmpxchg.vl
    2  tests/cases/types/newtype-read-write-brands.vl
    2  tests/cases/run/memory-intrinsic-arg-wide-context.vl
    2  tests/cases/memory/store-width-in-lambda.vl
    2  tests/cases/memory/load-width-in-named-fn-with-lambda.vl
    2  tests/cases/memory/flat-generic-rows-branded.vl
    2  tests/cases/memory/flat-generic-rows-branded-bracket.vl
    2  tests/cases/intrinsics/memarg-offset-simd-atomics.vl
    1  tests/cases/simd/vector-nullable-and-union.vl
    1  tests/cases/simd/f32x4-roundtrip.vl
    1  tests/cases/run/memory-intrinsic-in-named-fn.vl
    1  tests/cases/numerics/trunc-sat.vl
    1  tests/cases/memory/store-widths-round-trip.vl
    1  tests/cases/memory/store-only-forces-memory.vl
    1  tests/cases/memory/load-zero-extend-i64.vl
    1  tests/cases/intrinsics/parameter-shadows-intrinsic-name.vl
    1  tests/cases/expressions/const-expr-fold.vl
    1  tests/cases/conditionals/tail-if-assignment-value.vl
    1  tests/cases/conditionals/statement-if-value-discarded.vl
    1  tests/cases/atomics/getter-atomic-load.vl
```
