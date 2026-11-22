# RStructEq is a scalar compare, and is claimed (IR-C1)

`RStructEq` (#9503, #9510 and #9551, IR-N8) moves from the `other` family to `scalar`, beside
`RUnionEq`, `RNulNicheEq` and `RClosureEq`. The builder asks legacy's `structEqStagesLeft`,
`structEqStagesRight` and `refListReadPlain`. The lowering writes legacy's `structEqEnter`,
`structEqRoots`, `structEqTail` and `structEqRowsBank`. There is no new admission predicate.

## Claimed against covered after this change

At this head the T8 probe (mode 5) finds no covered-but-unclaimed function on any I8 population.
Before it, RStructEq was the only set left: 35 functions in tests/cases, 2 in the distilled corpus
and 4 in the filed witnesses, with none in the self-compile or the capability probes. The only
claim fallbacks are the two `claims-fallbacks.txt` holds.

The `other` family still holds `RCellGet`, `RCellNew`, `RFnId`, `RTagOf`, `SCellSet` and `SSwitch`.
No covered function holds one, since each lowers as `rhs outside I1` or is never built. The
coverage PR that first reaches one moves it to a claimed family (coordinator ruling, 2026-11-22).

## Readings (fixpoint seeds on both sides)

The base is c2369355: the RClosureEq stack merged with master, which holds #9551.

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7624, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45223 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 45223 corpus functions emitted by the IR (= covered), 19482 over 4982 filed witnesses; no fallback |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED, `ir prepost` included |
| L2 self-compile fuel per PR | +0.00% on 112145612256 |
| tests/cases claimed (`fnc` rows) | 68948 → 68992 (+44, 0 lost) |

## The functions released (tests/cases, file and function)

```
tests/cases/generics/hole-list-literal-of-anonymous-record-pin.vl  h
tests/cases/generics/hole-list-literal-of-record-at-two-types.vl  __lambda_3
tests/cases/literal-unions/litunion-list-equality.vl  fieldEq
tests/cases/literal-unions/litunion-list-equality.vl  fieldNe
tests/cases/literal-unions/nullable-litunion-list-equality.vl  fieldAtomEq
tests/cases/literal-unions/nullable-litunion-list-equality.vl  fieldAtomNullVsValue
tests/cases/literal-unions/nullable-litunion-list-equality.vl  fieldBoolEq
tests/cases/literal-unions/nullable-litunion-list-equality.vl  fieldBoolNullVsFalse
tests/cases/modules/runtime-helper-keys/entry.vl  same$m1855469683
tests/cases/modules/runtime-helper-keys/entry2.vl  near$m126092538
tests/cases/modules/runtime-helper-keys/entry2.vl  same$m1855469683
tests/cases/modules/runtime-helper-keys/other.vl  near
tests/cases/modules/runtime-helper-keys/store.vl  same
tests/cases/objects/empty-object-all-nullable-runs.vl  takesE$m117672078
tests/cases/objects/struct-eq-same-shape-two-names.vl  same
tests/cases/objects/struct-field-equality-i32-list.vl  differs
tests/cases/objects/struct-field-equality-i32-list.vl  same
tests/cases/std/array-needle-union-arm.vl  count$m2079220213
tests/cases/std/array-needle-union-arm.vl  count$m2079220213$1
tests/cases/std/array-needle-union-arm.vl  includes$m2079220213
tests/cases/std/array-needle-union-arm.vl  indexOf$m2079220213
tests/cases/std/array-needle-union-arm.vl  indexOf$m2079220213$1
tests/cases/std/array-needle-union-arm.vl  lastIndexOf$m2079220213
tests/cases/std/array-struct-element-function-scope.vl  indexOf$m2079220213
tests/cases/std/array-struct-element-module-scope.vl  indexOf$m2079220213
tests/cases/structs/diamond-record-eq-list-leaf.vl  same
tests/cases/structs/record-nested-record-list-field-eq.vl  same
tests/cases/structs/recursive-nullable-field-equality.vl  eqP
tests/cases/structs/recursive-nullable-field-equality.vl  neP
tests/cases/structs/recursive-record-eq-inferred-left.vl  check
tests/cases/structs/recursive-record-eq.vl  same
tests/cases/unions/arm-struct-equality.vl  cell
tests/cases/unions/arm-struct-equality.vl  cellCall
tests/cases/unions/arm-struct-equality.vl  cellRich
tests/cases/unions/arm-struct-equality.vl  cellRichList
tests/cases/unions/arm-struct-equality.vl  cellRichStr
tests/cases/unions/arm-struct-equality.vl  eqT
tests/cases/unions/arm-struct-equality.vl  eqc
tests/cases/unions/error-arm-struct-equality-cross-arm.vl  cell
tests/cases/unions/error-arm-struct-equality-cross-arm.vl  differ
tests/cases/unions/error-arm-struct-equality-mixed.vl  cell
tests/cases/unions/error-arm-struct-equality-mixed.vl  differ
tests/cases/unions/error-arm-struct-equality-mixed.vl  params
tests/cases/unions/module-global-arm-through-generic-eq.vl  eqT
```
