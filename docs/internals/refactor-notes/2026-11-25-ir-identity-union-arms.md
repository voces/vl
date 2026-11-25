# Identity over a union with function arms (2026-11-25, lane COV-START)

COV-START's `operator ==` class held five start bodies. Each is an `===` or `!==` whose operand is
a union with function arms. Legacy writes them on two routes (`eqRouteOf`), and the builder took
neither. Both fell through to the plain operator, which refuses an identity.

## The mechanisms, one commit each

- **A union of record and function arms (`identMixed`).** `emitIdentityMixed` stages each
  operand's payload as an `eqref`, then compares two closures by declaration and environment, and
  anything else by `ref.eq`.
  - The builder now takes this route as the existing `RIdentityEq`.
  - The lowering stages the left payload and ends in `identityMixedTail`. That tail is split out of
    `emitIdentityMixed`, so legacy and the IR write one compare.
- **A union of two function types (`unionUnion`).** Legacy writes the identity with the same staged
  compare as `==`. `unionUnionEqStagedOf` refused every identity. `unionEqOf` now takes an
  identity only when its route is `unionUnion`.
- **`x === null` over a per-arm union.** Legacy's route takes it as `identMixed`. The builder's
  null test claimed it first, a pre-existing armed-shadow mismatch (`bytes: prefix or locals`).
  The null test now yields to that route.

## Measured

The class's programs, armed shadow (`$VL_IR_SHADOW=1`), master → head:

| program | master | head |
|---|---|---|
| witness D16039 | start uncovered `operator ==` | start matched |
| witness D7701 | start uncovered `operator ==` | start matched |
| `scripts/capability-probes/identity-eq-mixed-union.vl` | start uncovered | start matched |
| `tests/cases/closures/function-values-in-two-union-arms-equality.vl` | start uncovered | start matched |
| `tests/cases/operators/identity-eq-mixed-record-fn-union.vl` | start and 2 functions uncovered | all matched |

The sweep `tests/cases/operators/identity-union-positions.vl` covers both shapes:
- operand positions: a binding, a parameter, a field, an element and a call result;
- a nullable union, and `x === null`;
- in a start body and in functions.

It prints the same lines on legacy and under `$VL_IR_STRICT=1`. Its start body and all ten
functions are matched. On master the start body and two functions missed, and `x === null`
mismatched.
