# RNumUnionBin is a scalar numeric operator, and is claimed (IR-C1)

`RNumUnionBin` (#9489) moves from the `other` family to `scalar`, beside `RPrimOp`. The builder asks
legacy's own questions (`numUnionIsUnionSide`, `numUnionSideBoxed`, `numUnionSideLit`,
`numUnionSidePrim`). The lowering writes legacy's stash (`numUnionStashEnter`,
`numUnionStashTail`) and its dispatch (`numUnionBinTail`). Neither reads state that legacy fills
while it emits, and there is no new admission predicate. Stacked on the `mem` family split
(#9519's new head), which rewrites the same `other` arm.

## Readings (base 45991da60 = master 228cfa5e1 + #9512, fixpoint seeds on both sides)

| reading | result |
| --- | --- |
| `ir-identity.sh --cases` | identical 7615, fail under both 68, differ 0, timeout 0; witnesses same 61, differ 0 |
| `ir-identity.sh --claimless` | identical 14019, fail under both 3267, differ 0, timeout 0 |
| `ir-identity.sh <base> <head> --names` | identical 9037, differ 0, built under one only 0; self-compile identical |
| armed shadow, corpus | 45678 functions, 45093 covered = verified = matched |
| armed shadow, `--cases` | no class above baseline |
| `ir-shadow.vl --claims` | 45052 corpus functions emitted by the IR, 18232 over 4982 filed witnesses; no fallback |
| L2 self-compile fuel per PR | +0.00% on 110741584201 |
| tests/cases claimed (mode 5, `fnc` rows) | 64617 → 64661 (+44, 0 lost) |

## The functions released (tests/cases, file and function)

```
tests/cases/generics/coalesce-hole-join-beside-second-pin.vl  small
tests/cases/generics/coalesce-hole-join-beside-second-pin.vl  take
tests/cases/generics/coalesce-hole-nullable-element-default.vl  orHalfScalar
tests/cases/generics/hole-coalesce-join-operand-tp-list-literal.vl  takeN
tests/cases/generics/kept-apart-join-rejoined-keeps-numbers.vl  F
tests/cases/generics/lambda-join-call-readers.vl  Rd
tests/cases/generics/numeric-join-held-back-through-a-wrapper.vl  v
tests/cases/generics/numeric-join-of-two-type-parameters.vl  bound
tests/cases/generics/numeric-join-of-two-type-parameters.vl  hole
tests/cases/generics/numeric-join-of-two-type-parameters.vl  narrow
tests/cases/generics/union-alias-pin-eq-needle.vl  __lambda_0
tests/cases/generics/union-alias-pin-eq-needle.vl  count$m2079220213
tests/cases/generics/union-alias-pin-eq-needle.vl  idx$m789685185
tests/cases/generics/union-alias-pin-eq-needle.vl  idx$m789685185$1
tests/cases/generics/union-alias-pin-eq-needle.vl  includes$m2079220213
tests/cases/generics/union-alias-pin-eq-needle.vl  indexOf$m2079220213
tests/cases/generics/union-alias-pin-eq-needle.vl  lastIndexOf$m2079220213
tests/cases/literal-unions/coalesce-hole-call-litunion-join.vl  plusOne$4
tests/cases/literal-unions/coalesce-hole-call-litunion-join.vl  plusOne$5
tests/cases/literal-unions/hole-litunion-arith-base-scalar.vl  __lambda_1
tests/cases/literal-unions/hole-litunion-arith-base-scalar.vl  dbl
tests/cases/literal-unions/hole-litunion-arith-base-scalar.vl  less
tests/cases/literal-unions/hole-litunion-arith-base-scalar.vl  thrice
tests/cases/match/int-lit-set-dispatch.vl  wide
tests/cases/numerics/coalesce-joins-runtime-numbers-apart.vl  bind$m279926476
tests/cases/numerics/coalesce-joins-runtime-numbers-apart.vl  left$m279926476
tests/cases/numerics/coalesce-read-joins-runtime-numbers-apart.vl  show
tests/cases/numerics/helper-join-read-by-generic-caller.vl  plus
tests/cases/numerics/hole-param-numeric-union-past-null.vl  acc
tests/cases/numerics/hole-param-numeric-union-past-null.vl  use
tests/cases/numerics/list-literal-joins-runtime-numbers-apart.vl  indexOf$m2079220213
tests/cases/numerics/list-literal-joins-runtime-numbers-apart.vl  pair$m1749147339
tests/cases/numerics/numeric-union-dispatch.vl  acc
tests/cases/numerics/numeric-union-dispatch.vl  f
tests/cases/numerics/numeric-union-dispatch.vl  gen
tests/cases/numerics/numeric-union-dispatch.vl  hole
tests/cases/numerics/numeric-union-dispatch.vl  m
tests/cases/numerics/numeric-union-dispatch.vl  pair
tests/cases/numerics/numeric-union-dispatch.vl  wide
tests/cases/soundness/getter-alias-write-ends-place-narrowing.vl  compound
tests/cases/unions/captured-copy-of-mixed-width-litunion-list.vl  sum
tests/cases/unions/hole-num-box-union-pin.vl  take
tests/cases/unions/hole-num-box-union-pin.vl  three
tests/cases/unions/numeric-tag-mixed-arm-read.vl  show
```
