# IR null name test: a left `null` side that stores (2026-11-25, lane COV-IS)

- **The miss**: `null name test of a null side that stores`. A `null`-typed left side of a name's
  null test (`emitNulNameTestBin`) runs for its effect ahead of the test; the builder took effects
  that are temps only (`onlyTempsFrom`), and an assignment's store is a statement.
- **What landed**: the store is written where it stands in the body, ahead of the test, which is
  legacy's order (the side first). Where the tested operand has an effect of its own (two
  assignments compared), the miss stays: there the lowering's order does not hold.
- **The class** (`tests/cases/null`, `VL_IR_SHADOW=2`): 9 → 1.
  `compare-an-assignment-of-null-to-a-captured-let-null.vl` matches in full;
  `compare-an-assignment-of-null-to-a-nullable.vl` keeps `pairs` (two stores); its other rows and
  `null-unit-call-assign-compared-with-other-nullable.vl`'s move on to `null name test of a
  non-name null side` (the `null` side on the right, written after the tested operand).
- **Q58 position sweep** (`tests/cases/null/assignment-of-null-compared-left-positions.vl`, new): a
  call's argument, a `const`, an `if` condition, a global target and a closure. On master 5
  functions are this miss; here all 6 match.
