# Nested width behind `| null` (D16705), 2026-11-16

Lane WIDTH, following D3431's close. This PR stacks on that change.

## What changed

- `recWidthFit` (`check_obj_shape.vl`) reads through `| null` when both sides are nullable, so a
  nested record behind a nullable field is a nested width pair. A field that goes from `O` to
  `O | null` is still a storage difference, which D2996 governs.
- `objDroppedFieldsAt` names a dropped field through the same `| null` (`pet.purr`).
- `slotUse` follows an `OptMember` read as it follows a `Member` read. Any operator other than `=`
  and `??` ends the value where the operator's result is typed as before; a `!= null` test is the
  case that needed it.

## Measurements

| instrument | before (D3431 seed) | after |
| --- | --- | --- |
| `record-nested-width-nullable.matrix.vl` (new) | runs 21 of 58 graded, 2 owed | runs 56 of 56 graded, 4 owed, 0 silent, 0 runs → not-runs |
| `record-nested-width-existing.matrix.vl` | 74 of 74, 8 owed | 74 of 74, 8 owed |

## Residue

- D16750: a literal binding whose nested record lands in nullable, narrower storage and is then
  read for the dropped field is refused at emit. D2996 owes a check refusal there.
