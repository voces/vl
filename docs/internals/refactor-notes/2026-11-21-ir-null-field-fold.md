# IR: one Rhs for a record field's null (2026-11-21, lane IR-D1)

Coordinator ruling, 2026-11-21: once #9353 lands, fold its `ROmitNull` and IR-N5's `RFieldNull` into
one Rhs kind. Byte-identical, and the lowering asks one plan.

## The change

`ROmitNull { omRow, omField }`, an omitted field's null, and `RFieldNull { fnRow, fnFi }`, a field's
explicit typed `null`, both lowered through `emitOmittedFieldNull(row, field)`. They are now one
kind, `RFieldNull`:
- the object-literal builder's omitted-field arm builds it too;
- its verifier rule is the omitted arm's, the wider one (a nullable or a box), since the explicit
  arm's destination is a nullable reference and passes it;
- its family is `record`. Every family is claimed, so the claim is unchanged.

## Measured vs master 7781e9bd (fixpoint seeds on both sides)

See the PR body: `--names` and `--claimless` differ 0.
