# COV-CALL: a record compare whose right operand is a valued `if` (2026-11-25)

Lane COV-CALL, class `record compare right operand`.

## Mechanism

When a record compare's right operand is stashed (a valued `if`, as in `v == (if u is P { u } else
{ v })`), legacy stashes the left too, written first. `structEqOpAt` refused any valued `if` the
right built above the left (`ifBelowLeadOf`). It now stages the left below it with `irBStageLeads`,
the same staging an operand list applies to its leads. The lowering's stashed-left read takes the
staged root.

A left element place (`[receiver, index]`) keeps the old check.

## Census (`CENSUS_CLASS=classes/record-compare-right-operand.txt`, rows)

| row | before | after |
|---|---:|---:|
| `record compare right operand` | 7 | 0 |

The class programs are byte-identical to the base seed under `VL_IR_STRICT=1 VL_IR_SHADOW=6`.

## Proof

- **Q58 sweep:** `tests/cases/operators/record-compare-valued-if-right-positions.vl` puts the compare
  at a `let`, an argument, an `if` condition, an interpolation, under `!`, a nullable compare and a
  `!=`. On master 7 of its functions miss on this row; with this change none, and all match.
