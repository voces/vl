# IR null name test: a right `null` side that stores (2026-11-25, lane COV-IS)

- **The miss**: `null name test of a non-name null side`. A `null` side on the right of a name's
  null test (`z == (n = null)`) runs after the tested name's read in legacy (`emitNulNameTestBin`);
  the builder took a left side only (#10200).
- **What landed** (the general form, behaviour parity after #10171): a right side whose store writes
  a name other than the tested one from an effect-free value (`rightNullStoreCommutes`) is built as
  the left side is, the store first. Reading the tested name before or after that store gives the
  same answer. A store to the tested name itself (`w == (w = null)`), or a value with an effect,
  stays legacy's.
- **Behaviour parity**: the claimed functions build other bytes than legacy's (the store ahead of the
  read) and run alike: `ir-parity.vl --behaviour-only` reads `same, behaviour` on
  `null/compare-an-assignment-of-null-to-a-nullable.vl`, `null/null-unit-call-assign-compared-with-other-nullable.vl`
  and the sweep.
- **Q58 position sweep** (`tests/cases/null/assignment-of-null-compared-right-positions.vl`, new): a
  call's argument, a `const`, an `if`, a global target and a name's value, plus `sameName`. On
  master 6 functions are this miss; here 5 are claimed (`sameName` stays).
