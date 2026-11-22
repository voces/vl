# RClosureEq is a scalar compare, and is claimed (IR-C1)

`RClosureEq` (#9531, IR-N8) moves from the `other` family to `scalar`, beside `RUnionEq` and
`RNulNicheEq`. The builder asks legacy's `eqOperandRecovers` and builds both closures, and the
lowering writes them and legacy's `closureEqTail`. Neither reads state that legacy fills while it
emits, and there is no new admission predicate.

## Readings (fixpoint seeds on both sides)

The base is a5fba58a: the RCast stack merged with master d78eca95, RClosureEq still in `other`.

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7624, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45201 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 45199 corpus functions emitted by the IR, 19437 over 4982 filed witnesses; no fallback |
| deep-nesting margin | base fail 921 / pass 925 KB; head fail 921 / pass 925 KB |
| `gate.sh --fast` (host with mode 6) | FAST TIER PASSED, `ir prepost` included |
| L2 self-compile fuel per PR | +0.00% on 112008756626 |
| tests/cases claimed (`fnc` rows) | 68772 → 68790 (+18, 0 lost) |

## The functions released (tests/cases, file and function)

```
tests/cases/closures/called-hole-fn-param-alias-compared.vl  run
tests/cases/closures/capturing-nested-function-read-twice-equality.vl  looped
tests/cases/closures/capturing-nested-function-read-twice-equality.vl  outer
tests/cases/closures/capturing-nested-function-read-twice-equality.vl  written
tests/cases/closures/closure-dispatch-index-identity.vl  go
tests/cases/closures/generic-delivered-into-two-bindings-compared.vl  same
tests/cases/closures/hole-fn-if-bound-called-compared.vl  g
tests/cases/closures/uncalled-hole-fn-compared-in-callee.vl  run
tests/cases/closures/written-fn-binding-two-types-equality.vl  main
tests/cases/closures/written-let-of-generics-compared-unequal-runs.vl  main
tests/cases/generics/generic-fn-compared-in-function-then-delivered-at-another-type.vl  g
tests/cases/generics/generic-fn-compared-in-function-then-delivered-at-another-type.vl  h
tests/cases/generics/open-generics-into-fn-typed-params-default-bind.vl  same
tests/cases/generics/open-generics-into-fn-typed-params-in-generic-body.vl  alike
tests/cases/generics/open-generics-into-fn-typed-params-in-generic-body.vl  same
tests/cases/generics/open-generics-through-const-into-fn-typed-params.vl  same
tests/cases/operators/identity-eq-union-nullable-fn.vl  fns
tests/cases/operators/identity-eq-written-fn-binding.vl  main
```
