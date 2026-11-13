# Step 7 (lane D, D16032): the checklist's quick wins and the element-union readers, 2026-11-13

Three items off D16032's checklist (#7868):

- **A dead name path.** `unionRowArmTys` (emit_map_twins) asked `msSetOfRowOr(u, "")`, a fallback
  that could find no row for an empty name. It now reads `msSetOfRow(u)` (exported for it).
- **`emitUnionCoerceUnder`** (wasmEmit) held the row its type keys (`unRowOfTyKey(unionTy)`) but
  passed `emitUnionCoerceRecord` the set of `msSetOfUnion(unionNameIn)`. It passes
  `msSetOfRowOr(row, unionNameIn)` now.
- **The element-union readers** (emit_union_atoms) read the row the ref-list slot's element type
  keys (`elemUnionRowOf(slot)`), with the name path as a fallback. Before,
  `unionRefArrayArmSlotForElemAtom` turned that row back into a name and looked it up again, and
  `elemUnionHasArrayMember` was passed the raw stored `rlElemName[slot]`.
  `elemUnionHasLitUnionMember` and `elemUnionHasArrayMember` take the slot.

`memberUnionFieldName` and `nulRefMapValInnerOfTy` stay as they are. Both reach the name through
`unionArmsOfSetTy`, which already holds their set or type; lane G's reorder of that function
(set and type before the name) demotes both to fallbacks.

## Measurement

MPROBE over the 24,070-record population:

| site | programs | same | differ |
| --- | --- | --- | --- |
| `emitUnionCoerceUnder`: row's set against the name's | 4,760 | 4,756 | 10 |
| element-union atoms: slot row against the name's | 1 | 1 | 0 |
| `unionRowArmTys`, `elemUnionMemberTys` | not reached | — | — |

The 10 that differ are numeric literal unions (lane G's key fold, task #21). In those programs the
row's set and the name's set are different sets. Every program of that family still builds
identical: 234 of 234 SAME, plus 20 refused alike, out of 254.

**Byte comparison:** master against this change, 4,760 of 4,760 programs reaching
`emitUnionCoerceUnder`, and the one reaching the element readers, build identical.

## Proof

- **Seed:** fixpoint (`cmp`).
- **Locally:** lint-self, `scripts/gate.sh`, `mono-tyaram-grid.sh`.
