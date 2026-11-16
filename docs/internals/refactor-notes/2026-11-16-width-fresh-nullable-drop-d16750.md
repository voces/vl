# A literal binding's nested drop into nullable storage goes to the drop adoption (D16750), 2026-11-16

Lane WIDTH, residue of D16705.

## What changed

`objShapeSameNamesAdapts` (`check_fit_rules.vl`) used to exempt an un-annotated literal binding from
the nested pair entirely. When its nested record drops a field at the destination (`recDropFits`,
which reads through `| null`), the pair is now an adapter. The delivery seam then hands it to
`recDropAdopt` (D15093), which builds the binding at the destination when no use needs its own
layout, and refuses it with D2996's sentence when one does. Before, the emitter built it at the
narrower shape and a read of the dropped field failed at emit. A width-only nested pair (D3431) is
classified first and is unaffected.

## Measurements

| instrument | before (master fixpoint) | after |
| --- | --- | --- |
| `record-nested-width-nullable.matrix.vl` with `fresh_literal_unread` / `fresh_literal_read` | the read cell an emit reject in both faces | 58 of 58 graded run, 6 owed; the read cell owed |
| `record-nested-width-existing.matrix.vl` | 74 of 74, 8 owed | 74 of 74, 8 owed |
| sweep (25,344 programs) | | 0 runs → not-runs, 0 new compiler traps, 1 mover (D16750 emit → check) |

The adapter applies only to a binding whose uses are all field reads (`recDropOnlyReads`). A binding
handed on at its own type keeps D3339's adoption, which `vl_check_skip_test` pins (an exported
literal `pk` handed on as `const q2 = pk`, refused in its module rather than at the delivery).
