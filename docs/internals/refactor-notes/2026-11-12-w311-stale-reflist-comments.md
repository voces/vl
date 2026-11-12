# Step 7: comments that named the deleted ref-list name path, rewritten, 2026-11-12

Lane F's reflist stack (#7607, #7612, #7617, #7618, #7621, #7636) deleted these functions:

- `refArrShapeKind`, `refArrElemKind`, `refArrElemName`, `nameIsRefArray`;
- `rlSlotByName`, `rlSlotByNameK`, `rlRowOfNameMinted`, `rlNameMint`;
- `refListElemNameOfExpr`, `repRowOfName`, `renderFaithful`, `shapeElemDeclaredStructIdx`,
  `nameIsElemArray`.

On master `fe0c3ce3`, 24 comments in 9 files still named them. Most called a typed reader "the arena
reading of `rlSlotByName(refArrElemName(…))`", or said a table key matches "the string
`refArrElemName` yields". Each comment now states the mechanism that is there, or drops the
clause.

| file | comments |
| --- | --- |
| `emit_map_value_slots.vl` | 6 |
| `emit_classify.vl` | 5 |
| `emit_shape_rows.vl` | 4 |
| `check_emit_queries.vl`, `emit_state.vl`, `emit_union_registry.vl` | 2 each |
| `emit_collect.vl`, `emit_fn_scans.vl`, `emit_union_atoms.vl` | 1 each |

## Proof

- A comment-only change: the seed built from this tree is byte-identical (`cmp`) to the one built
  from master `fe0c3ce3`, both at a fixpoint (6,713,278 bytes).
- `lint-self.sh`: `self-lint + fmt-check clean`, comment budget unchanged at 0.
- A grep for the 13 names over `compiler/` finds 0.

The owning lanes (E, G, H) were told before the push.
