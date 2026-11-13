# D16033: a nullable record compares with the bare record once a union holding it is declared, 2026-11-13

Lane E. Approved by the coordinator to land ahead of `===` (D15975). Found while probing the operand
types `===` will share.

## Defect

`A | null == A` was a loud emit refusal (`struct equality over a non-struct operand`) whenever a union
holding `A` was declared, even an unused one. Declaring the union makes `A` a variant record, which
has no struct-table row. `emitNulStructEq` looked for a row in two places:
- `binEqNulVariantRow`, which needs both sides nullable over one variant row;
- `structIndexOfExpr` of the left operand.

Neither answers when the other side is a bare `A`.

## Changed

`emitNulStructEq` takes the nullable side's `nulVariantIdxOfExpr` and accepts it when the bare
side's `eqConcreteVariantRow` is the same row. The compare core below it is unchanged. No union box
is read.

## Proof

- D16033's witness moves from `emit_reject` to runs (`check-filed-witnesses --strict`). The row is
  closed.
- `tests/cases/operators/nullable-record-eq-variant-record.vl`: eight cells. They cover both operand
  orders, a null side, differing values, `!=`, and a `let` reassigned between a record and `null`.
  On the base seed the file is refused at emit.
- Sweep with fixpoint seeds on both sides: SWEEP.
- Render-parse census: CENSUS.
- `scripts/gate.sh`: all rows pass.
