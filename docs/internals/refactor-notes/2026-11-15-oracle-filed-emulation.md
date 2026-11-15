# Oracle: filed wrong values are matched by an emulation of their row (2026-11-15, lane O)

known.txt named a filed wrong value only by its fuzz cell id. The nightly draws fresh seeds, so
an open row's family went red on any new cell.

## Shape

- `interp.ts` exports `emulating`, a set of row ids. When a row is in the set, the code at that
  row's mechanism reproduces the compiler's current reading:
  - **D16498:** a radix `/ % << >>` arm in an `i64` join is its 32-bit reading, sign-extended.
  - **D16497:** a float literal join in a `min`/`max` argument, or in a constant tree beside an
    `f32`, stays `f64`.
- `oracle.ts diff` re-interprets a DISAGREE whose compiled side ran, once per `(emulated)` row in
  known.txt. If the oracle then agrees under exactly one row, the cell is FILED-WRONG with that
  row. The report counts it per row, and it is not a new disagreement.
- An emulation only reclassifies a cell the normal run already calls DISAGREE. It never runs
  otherwise, so it cannot change what AGREEs. `interpret` clears the set before and after each run.
- `tests/oracle_smoke_test.ts` fails once an emulated row's status line reads closed, so the PR
  that closes the row deletes its emulation and its known.txt line.

Cost: 13 added lines in `interp.ts`: 3 for the shared set, 5 for D16498 and 4 for D16497. The
cell lines `ar_s36_0009` and `ar_s39_0017` leave known.txt.

## Measurement

Seeds 31-100 of `gen.ts`, 14,000 cases, on master `921f4b865` with a host built from it:

    FILED-WRONG D16497: 1 cell(s)
    FILED-WRONG D16498: 1 cell(s)
    oracle: 14000 cells, 13021 in subset (93.0%), AGREE 12505, COMPILED-BAD 1, DISAGREE 23, FILED-WRONG 2, REFUSED 487, SKIP 979, UNSOUND 3

The COMPILED-BAD cell is D16496's `ar_s42_0050`, closed by #8451.

The 23 DISAGREE and 3 UNSOUND cells are not explained by any filed row. That is 0.19% of cases,
about four per 2,000-case nightly arith leg. They are the next triage, as either oracle gaps or
new rows.
