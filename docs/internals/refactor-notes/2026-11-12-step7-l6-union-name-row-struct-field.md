# Step 7 L6: a member read of a struct field hands back its element union's row, 2026-11-12

This is step B, part 8, and the last producer rung of the `unNames` spelling readers. Part 4 left
struct fields with no row: two programs (`unions/record-arms-same-field-over-field.vl`, D4056, and
`unions/shared-nullable-scalar-field-read.vl`, D13280) named a box their records share, apart
from the field type's own row. Before a flag for such a box was built, a probe compared the row
of the field's element-type column (`sFieldElemTyIxAt`) against the row the returned name is
bound to (`unRowOfName`). The population is the whole sweep, 24,076 programs.

| struct path in `memberUnionFieldName` | programs | same | differ |
| --- | --- | --- | --- |
| the receiver's struct row | 1,220 | 1,220 | 0 |
| a union receiver's arm, probed by spelling | 10 | 10 | 0 |

Both shared-box programs now agree: the element-type column records the shared box's type. So
no flag is needed.

## Changed

- `memStructFieldName` names a struct field's element union and records the row its element
  type keys to, as `memVariantFieldName` does for a variant field. Both struct paths use it.

With this, every producer rung of `unionNameOfExpr` hands back a row except the floors already
named: the twin rows under one spelling, a literal-leaf inferred return, and the two call
branches no program reaches.

## Proof

- **Targeted.** The 1,027 of the 1,227 cells reaching these paths that are files were built on a
  master seed and this one: 1,027 byte-identical modules. CI's sweep is the proof for the
  population.
- **Checks.** lint-self is clean. `regress.vl` loses no runs. The export budget, with findings,
  has 0 dead exports. Render-parse is flat at 13 renders and 55 parses.
