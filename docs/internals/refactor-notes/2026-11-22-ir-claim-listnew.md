# The list constructors are claimed (IR-C1)

`RListNew`, `RListNewDefault` and `RListCopy` move from the `other` family to `list`. The builder
reads `arrNewPlanOf` and `arrCopyPlanOf`, and the lowering writes legacy's length stash
(`arrNewLenStash`, `arrNewFillStep`) and tails (`arrNewTail`, `arrNewDefaultTail`). There is no new
admission predicate. `RListCopy`'s value form is still `irLMiss("list copy value")`, so only its
statement form claims.

**A hypothesis, unreproduced (IR-N3).** The builder asks `arrNewPlanOf` for `anWhy`, and the plan's
pair (`fa64Ty()` and the others) mints on first ask. So a claimed function whose first such list is
an `__array_new__` after a statement whose type mints at lowering could move the type section.
Nine programs of that shape are byte-identical between this change's seed and its base: list,
string-list, record, closure and i64-list prefixes, with and without a typed local. The decision
and pair split (IR-N3, option (a)) would remove the ask as hardening.

## Readings (base d46c311b = RCallHost's head, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7619, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45099 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 45075 corpus functions emitted by the IR, 19345 over 4982 filed witnesses; no fallback |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED, `ir prepost` included |
| L2 self-compile fuel per PR | -0.00% on 111344012587 |
| tests/cases claimed (`fnc` rows) | 68220 → 68403 (+183, 0 lost) |

## The functions released (tests/cases, file and function)

```
tests/cases/arrays/arm-element-list-mutation.vl  fillIt
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$1
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$10
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$11
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$12
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$13
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$14
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$15
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$16
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$17
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$2
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$3
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$4
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$5
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$6
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$7
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$8
tests/cases/arrays/array-new-generic-pin-element-grid.vl  filled$9
tests/cases/arrays/array-new-generic-pin-two-elements.vl  filled
tests/cases/arrays/array-new-generic-pin-two-elements.vl  filled$1
tests/cases/arrays/array-new-generic-pin-two-elements.vl  mkA
tests/cases/arrays/array-new-generic-pin-two-elements.vl  mkB
tests/cases/arrays/array-new-i64-fill-generic-frame.vl  pick
tests/cases/arrays/array-new-i64-fill-generic-frame.vl  pick$1
tests/cases/arrays/array-new-i64-fill-generic-frame.vl  pick$2
tests/cases/arrays/array-new-i64-fill-generic-frame.vl  pickAnn
tests/cases/arrays/array-new-i64-fill-generic-frame.vl  pickHidden
tests/cases/arrays/filled-explicit-nullable-string-fill.vl  filled$m2079220213
tests/cases/arrays/filled-null-typed-by-destination.vl  filled$m2079220213
tests/cases/arrays/filled-null-typed-by-destination.vl  filled$m2079220213$1
tests/cases/arrays/filled-nullable-closure-shape-element-beside-union.vl  filled$m2079220213
tests/cases/arrays/filled-nullable-shape-element-beside-union.vl  filled$m2079220213
tests/cases/closures/remade-callback-call-records-type.vl  mk
tests/cases/expressions/scratch-frame-reservation-positions.vl  __lambda_1
tests/cases/expressions/scratch-frame-reservation-positions.vl  arrNewInIfExprArm
tests/cases/expressions/scratch-frame-reservation-positions.vl  arrNewInLet
tests/cases/expressions/scratch-frame-reservation-positions.vl  arrNewInMemberStmt
tests/cases/extern/global-export-named-memory.vl  loadBytes$m676885586
tests/cases/generics/destination-binds-literal-type-param.vl  filled$m2079220213
tests/cases/generics/destination-binds-literal-type-param.vl  filled$m2079220213$1
tests/cases/generics/destination-binds-literal-type-param.vl  filled$m2079220213$2
tests/cases/generics/destination-binds-literal-type-param.vl  filled$m2079220213$3
tests/cases/generics/filled-at-numeric-literal-union-type-argument.vl  filled$m2079220213
tests/cases/generics/filled-at-numeric-literal-union-type-argument.vl  mk$m939282963
tests/cases/generics/filled-string-literal-typed-by-literal-union-destination.vl  filled$m2079220213
tests/cases/generics/filled-string-literal-typed-by-literal-union-destination.vl  filled$m2079220213$1
tests/cases/generics/instance-expressions-typed-at-pin.vl  mk$m394483728
tests/cases/generics/instance-expressions-typed-at-pin.vl  mk$m394483728$1
tests/cases/generics/instance-expressions-typed-at-pin.vl  mk$m394483728$2
tests/cases/generics/literal-union-destination-body-closed.vl  filled$m2079220213
tests/cases/getters/getter-eval-order.vl  loadBytes$m676885586
tests/cases/inference/hole-callee-push-leaves-binding-open.vl  main
tests/cases/inference/hole-callee-write-pins-binding-at-flush.vl  main
tests/cases/intrinsics/array-copy-every-list-kind.vl  cp$m943821483
tests/cases/intrinsics/array-copy-every-list-kind.vl  zeroBytes$m1988629027
tests/cases/intrinsics/array-new-default-element-reps.vl  mk
tests/cases/intrinsics/array-new-default-hole-chain.vl  chain3
tests/cases/intrinsics/array-new-default-hole-chain.vl  chain4
tests/cases/intrinsics/array-new-default-hole-chain.vl  cycle3
tests/cases/intrinsics/array-new-default-hole-chain.vl  cycleOpen
tests/cases/intrinsics/array-new-default-lists.vl  bytes
tests/cases/intrinsics/array-new-default-lists.vl  fzeros
tests/cases/intrinsics/array-new-default-lists.vl  strs
tests/cases/intrinsics/array-new-default-lists.vl  zeros
tests/cases/intrinsics/array-new-default-local-reassign.vl  local
tests/cases/intrinsics/array-new-default-operand-hole.vl  alias
tests/cases/intrinsics/array-new-default-operand-hole.vl  coalesce
tests/cases/intrinsics/array-new-default-operand-hole.vl  compare
tests/cases/intrinsics/array-new-default-operand-hole.vl  earlyIntrinsic
tests/cases/intrinsics/array-new-default-operand-hole.vl  lhs
tests/cases/intrinsics/array-new-default-operand-hole.vl  negate
tests/cases/intrinsics/array-new-default-operand-hole.vl  rhs
tests/cases/intrinsics/array-new-default-operand-hole.vl  storeAfter
tests/cases/intrinsics/array-new-default-operand-hole.vl  widen
tests/cases/intrinsics/array-new-default-zero.vl  mk
tests/cases/intrinsics/array-new-f32-fill.vl  anfPick
tests/cases/intrinsics/array-new-nested-fill.vl  g$m561368378
tests/cases/intrinsics/array-new-nested-fill.vl  g$m561368378$1
tests/cases/intrinsics/array-new-nested-fill.vl  inFn$m561368378
tests/cases/intrinsics/checker-special-intrinsic-as-value.vl  $iv$__array_copy__
tests/cases/intrinsics/checker-special-intrinsic-as-value.vl  $iv$__array_copy__$1
tests/cases/intrinsics/checker-special-intrinsic-as-value.vl  $iv$__array_new__
tests/cases/intrinsics/checker-special-intrinsic-as-value.vl  $iv$__array_new__$1
tests/cases/literal-unions/litunion-order-cross-module-alias.vl  loadBytes$m676885586
tests/cases/loops/hoist-declines-on-closure-call.vl  loadBytes$m676885586
tests/cases/loops/hoist-declines-on-push.vl  loadBytes$m676885586
tests/cases/loops/hoist-declines-on-rebinding.vl  loadBytes$m676885586
tests/cases/loops/hoist-index-not-induction.vl  loadBytes$m676885586
tests/cases/loops/hoist-mem-intrinsic-body.vl  loadBytes$m676885586
tests/cases/loops/hoist-nested-two-arrays.vl  loadBytes$m676885586
tests/cases/loops/hoist-out-of-range-traps.vl  loadBytes$m676885586
tests/cases/memory/flat-fused-row-accessors.vl  loadBytes$m676885586
tests/cases/memory/flat-fused-row-getter.vl  loadBytes$m676885586
tests/cases/memory/flat-fused-row-import/entry.vl  loadBytes$m676885586
tests/cases/memory/flat-fused-row-one-accessor-set-two-containers.vl  loadBytes$m676885586
tests/cases/memory/flat-fused-row-past-page-end-traps.vl  loadBytes$m676885586
tests/cases/memory/flat-lua-tvalue-accessors.vl  loadBytes$m676885586
tests/cases/memory/flat-roundtrip-raw-addresses.vl  loadBytes$m676885586
tests/cases/modules/literal-binding-std-constant/entry.vl  loadBytes$m676885586
tests/cases/modules/read-only-callee-keeps-narrowing-any-entry/entry.vl  loadBytes$m676885586
tests/cases/modules/root-exports-memory-name/entry.vl  loadBytes$m676885586
tests/cases/modules/ufcs-not-imported-std-existing/entry.vl  loadBytes$m676885586
tests/cases/modules/ufcs-type-bound-applicable-local-wins/entry.vl  loadBytes$m676885586
tests/cases/modules/ufcs-type-bound-at-hole-parameter/entry.vl  loadBytes$m676885586
tests/cases/modules/ufcs-type-bound-past-inapplicable-local/entry.vl  loadBytes$m676885586
tests/cases/numerics/coalesce-joins-runtime-numbers-apart.vl  filled$m2079220213
tests/cases/simd/assign-vector-field-through-element-value-runs.vl  loadBytes$m676885586
tests/cases/simd/captured-reassigned-vector-cell.vl  loadBytes$m676885586
tests/cases/simd/coalesce-nullable-vector-list-cell-runs.vl  loadBytes$m676885586
tests/cases/simd/f32x4-function-values.vl  loadBytes$m676885586
tests/cases/simd/f32x4-geometry.vl  loadBytes$m676885586
tests/cases/simd/f32x4-kernel-vs-scalar.vl  loadBytes$m676885586
tests/cases/simd/f32x4-lanes-own-names.vl  loadBytes$m676885586
tests/cases/simd/f32x4-lanes.vl  loadBytes$m676885586
tests/cases/simd/f32x4-positions.vl  loadBytes$m676885586
tests/cases/simd/f32x4-std-surface.vl  loadBytes$m676885586
tests/cases/simd/getter-through-annotated-nullable-param-runs.vl  loadBytes$m676885586
tests/cases/simd/lane-index-constant-range-loop.vl  loadBytes$m676885586
tests/cases/simd/value-position-spill-of-effectful-place-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-annotated-empty-list-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-field-param-only-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-in-array-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-in-generic-array-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-in-map-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-in-struct-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-list-in-union-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-list-nullable-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-list-of-lists-runs.vl  loadBytes$m676885586
tests/cases/simd/vector-map-of-vector-lists-runs.vl  loadBytes$m676885586
tests/cases/soundness/dead-null-test-names-source-binding.vl  filled$m2079220213
tests/cases/soundness/getter-name-field-keeps-sole-reference.vl  loadBytes$m676885586
tests/cases/std/array-filled-elements.vl  filled$m2079220213
tests/cases/std/array-filled-elements.vl  filled$m2079220213$1
tests/cases/std/array-filled-elements.vl  filled$m2079220213$2
tests/cases/std/array-filled-negative-traps.vl  filled$m2079220213
tests/cases/std/array-filled.vl  filled$m2079220213
tests/cases/std/array-filled.vl  filled$m2079220213$1
tests/cases/std/array-filled.vl  filled$m2079220213$2
tests/cases/std/array-filled.vl  filled$m2079220213$3
tests/cases/std/array-filled.vl  filled$m2079220213$4
tests/cases/std/buffer-alloc.vl  loadBytes$m676885586
tests/cases/std/buffer-bulk.vl  loadBytes$m676885586
tests/cases/std/buffer-bytes-file-staging.vl  loadBytes$m676885586
tests/cases/std/buffer-bytes-roundtrip.vl  loadBytes$m676885586
tests/cases/std/buffer-growth.vl  loadBytes$m676885586
tests/cases/std/buffer-hoisted-accessors.vl  loadBytes$m676885586
tests/cases/std/buffer-hoisted-index-past-end-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-hoisted-negative-index-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-load-bytes-overflow-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-mark-release.vl  loadBytes$m676885586
tests/cases/std/buffer-narrow-stores.vl  loadBytes$m676885586
tests/cases/std/buffer-negative-length-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-peak.vl  loadBytes$m676885586
tests/cases/std/buffer-release-above-pointer-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-release-as-void-fn-value.vl  loadBytes$m676885586
tests/cases/std/buffer-release-below-base-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-size-overflow-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-store-bytes-overflow-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-store8-past-memory-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-type-named-by-its-constructor.vl  loadBytes$m676885586
tests/cases/std/buffer-view-bounds-control.vl  loadBytes$m676885586
tests/cases/std/buffer-view-bracket.vl  loadBytes$m676885586
tests/cases/std/buffer-view-extent-control.vl  loadBytes$m676885586
tests/cases/std/buffer-view-extent-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-view-index-past-end-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-view-negative-index-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-view-release-dangles.vl  loadBytes$m676885586
tests/cases/std/buffer-view-write-past-end-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-views.vl  loadBytes$m676885586
tests/cases/std/buffer-widths.vl  loadBytes$m676885586
tests/cases/std/buffer-window-negative-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-window-past-end-traps.vl  loadBytes$m676885586
tests/cases/std/buffer-window.vl  loadBytes$m676885586
tests/cases/std/bytes-zero-negative-traps.vl  zeroBytes$m1988629027
tests/cases/std/bytes-zero.vl  zeroBytes$m1988629027
tests/cases/std/fs-append-text.vl  loadBytes$m676885586
tests/cases/std/fs-into.vl  loadBytes$m676885586
tests/cases/std/fs-range.vl  loadBytes$m676885586
tests/cases/std/fs-roundtrip.vl  loadBytes$m676885586
tests/cases/std/fs-write.vl  loadBytes$m676885586
tests/cases/std/process-exit-never-narrows.vl  loadBytes$m676885586
tests/cases/unions/arm-with-buf-field-in-state-struct.vl  loadBytes$m676885586
```
