# Step 7 (L6, lane G #13 P2 step 2c): union operand arm kinds read off arm types, 2026-11-13

`leqNoteUnionArms` (emit_collect) and `unionArmsNeedCloEq` (emit_eq_rows) reserve compare frames
for a union operand's arms. Each read an arm's box kind by parsing its atom with `valueAtomKind`.
They now take `unionArmKindRowsOfExpr` (emit_classify). It gives each arm's kind as
`boxAtomKindOfMemberTy(ty)` (emit_rep, shared with lane D's #7820): `boxTagOfTy`, with `null` (-1) as 6, and -1 for a literal or literal-union
arm, matching what the name parse gave those arms. `unionArmRowsOfExpr` and
`unionArmAtomsOfExpr` are deleted.

The arms come from the operand's box type. Where that does not resolve, they come from the
named row's member slice (`msSliceTy`). Where no row records the union (a nullable map read's
miss, D9040), the arms are the node type's non-null part and `null`. Anything else hits a loud
floor.

## Decision table (probe over 24,020 corpus and witness files)

| path | programs | calls | kind or row disagreements |
| --- | --- | --- | --- |
| box type | 1,668 | 6,666 | 0 |
| row-less nullable, node type | 207 | 566 | 0 |
| floor | 0 | 0 | — |

A first draft floored the row-less case. That draft lost 20+ witness programs (D9040, D15116,
D14432, …), so the nullable arm was added.
