# D17090: an assignment of `null` is the null its destination holds (2026-11-24, lane S1)

An assignment of `null` the checker types `null` has the `null` unit as its value. Legacy wrote
it as the cell's own typed null in two places, and so built invalid wasm wherever the destination
owes another null:

- **A union box or a niche slot.** `exprIsNulNone` does not name an assignment, so the box sites
  boxed the cell's null as a payload. `boxOperandIsNulNone` (that test, or `asgYieldsNullLit`)
  now answers at the binding twin, the argument ladder (and its shadow note and map-read rung,
  which must agree with it) and the `null`-valued map's niche arm. `exprIsNulNone` is unchanged:
  answering there would reroute 16 programs that run today (the reach sweep below).
- **The value itself.** `emitAsgValueOf`'s `nullLit` arm wrote `emitExpr(binRight)`, the literal's
  own null. It now writes `emitNullAt` at the assignment: its destination's null, as a `null`
  value is everywhere else. The IR's `assignValueNullLit` reads the same `nullOwnAt`, so the ten
  lambdas `#9807` left as `assignment value nullLit rep` misses now cover and match.

The IR misses by name at a `null` local storing an assignment of `null` (`store of an assignment
of null into a null local`): legacy declares that local apart from the IR's. One such shape, a
list cell, mismatched on master already; it now misses instead.

## Reach

Two probe compilers, each checked against a control first, swept every `tests/cases` program,
capability probe, distilled cell and the matrix's cells (21,908 programs):

- `exprIsNulNone` asked about an assignment of `null`: 12 `tests/cases` programs and 6 matrix cells,
  16 of them running today. Not changed.
- The value arm where the destination's null is not the literal's: 15 programs, all matrix cells.

The matrix `null-assignment-value.matrix.vl`: 8 invalid-module cells become `RUNS`; under
`VL_IR_SHADOW=6` all 47 programs are clean. The union-box rows stay uncovered in the IR as
`box ladder` (N9's class).
