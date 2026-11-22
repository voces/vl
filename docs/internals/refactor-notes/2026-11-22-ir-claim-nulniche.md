# RNulNicheEq is a scalar compare, and is claimed (IR-C1)

`RNulNicheEq` (#9476, `==`/`!=` over nullable references on legacy's `nulNiche` route) moves from
the `other` family to `scalar`, beside `RUnionEq`, so claiming covers it. Its builder reads
`nulNicheEqWhy` (from `binEqNulNiche` and `exprIsLitAtom`), and its lowering writes legacy's
`nulNicheEqHead` and three tails. Neither reads state that legacy fills while it emits. There is no
new admission predicate. It was in `other` only so the coverage PR moved no shipped byte (IR-N7).

## Readings (base `2e0eaaf8f`, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7611, fail under both 68, differ 0, timeout 0; witnesses same 60, differ 0 |
| `ir-identity.sh --claimless` | identical 14018, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45028 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 44882 functions emitted by the IR; no fallback |
| L2 self-compile fuel per PR | +0.00% on 110326285329 |
| tests/cases claimed (mode 5, `fnc` rows) | 64064 → 64104 (+40, 0 lost) |

## The functions released (tests/cases, file and function)

```
tests/cases/arrays/list-eq-every-rep.vl  nullableF64List
tests/cases/arrays/list-eq-every-rep.vl  nullableStructList
tests/cases/generics/eq-concat-type-param-under-constructor-runs.vl  eqN$1
tests/cases/generics/hole-join-at-nullable-string-pin.vl  pick
tests/cases/generics/hole-join-at-nullable-string-pin.vl  viaLet
tests/cases/generics/hole-list-literal-in-any-position.vl  __lambda_2
tests/cases/generics/join-local-to-generic-at-nullable-string-pin.vl  f
tests/cases/generics/join-local-to-generic-at-nullable-string-pin.vl  h
tests/cases/generics/lambda-niche-signature-per-instance.vl  __lambda_10
tests/cases/generics/nullable-nested-reflist-elem-slot-inferred.vl  indexOf$m2079220213
tests/cases/generics/nullable-nested-reflist-elem-slot-inferred.vl  indexOf$m2079220213$1
tests/cases/generics/nullable-nested-reflist-elem-slot.vl  indexOf$m2079220213
tests/cases/literal-unions/litunion-list-equality.vl  nulBoth
tests/cases/literal-unions/litunion-list-equality.vl  nulBothNe
tests/cases/literal-unions/litunion-list-equality.vl  nulLeft
tests/cases/literal-unions/litunion-list-equality.vl  nulNull
tests/cases/std/array-needle-nullable-niche.vl  count$m2079220213
tests/cases/std/array-needle-nullable-niche.vl  count$m2079220213$1
tests/cases/std/array-needle-nullable-niche.vl  directControl$m1415926942
tests/cases/std/array-needle-nullable-niche.vl  includes$m2079220213
tests/cases/std/array-needle-nullable-niche.vl  includes$m2079220213$1
tests/cases/std/array-needle-nullable-niche.vl  includes$m2079220213$2
tests/cases/std/array-needle-nullable-niche.vl  includes$m2079220213$3
tests/cases/std/array-needle-nullable-niche.vl  includes$m2079220213$4
tests/cases/std/array-needle-nullable-niche.vl  includes$m2079220213$5
tests/cases/std/array-needle-nullable-niche.vl  indexOf$m2079220213
tests/cases/std/array-needle-nullable-niche.vl  indexOf$m2079220213$1
tests/cases/std/array-needle-nullable-niche.vl  indexOf$m2079220213$2
tests/cases/std/array-needle-nullable-niche.vl  indexOf$m2079220213$3
tests/cases/std/array-needle-nullable-niche.vl  indexOf$m2079220213$4
tests/cases/std/array-needle-nullable-niche.vl  indexOf$m2079220213$5
tests/cases/std/array-needle-nullable-niche.vl  lastIndexOf$m2079220213
tests/cases/std/array-needle-nullable-niche.vl  lastIndexOf$m2079220213$1
tests/cases/std/array-needle-nullable-niche.vl  myIndexOf$m1415926942
tests/cases/unions/nullable-niche-equality-guard.vl  cmpClo
tests/cases/unions/nullable-niche-equality-guard.vl  cmpList
tests/cases/unions/nullable-niche-equality-guard.vl  cmpRefList
tests/cases/unions/nullable-niche-equality-guard.vl  cmpStr
tests/cases/unions/nullable-niche-equality-guard.vl  cmpStrList
tests/cases/unions/nullable-niche-equality-guard.vl  neList
```
