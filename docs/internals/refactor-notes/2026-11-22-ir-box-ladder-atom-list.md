# IR: a literal-union list boxed under its arm's tag (2026-11-22, lane IR-N2)

`box ladder`, the list rung. On a fixpoint seed of master a00578d1, 95 corpus functions miss at
`box ladder` alone. An instrumented scratch seed named each one's value type, union and node.
Lists account for most of them, and the largest group is lists of literal-union members (`K[]`):
43 functions, spelled as an identifier or a literal.

Legacy boxes such a list through `emitUnionCoerceAtomBox` at value-atom kind 7. It writes a tag,
the list ref, then `struct.new` of the box. The tag is the atom-list arm's (`atomListArmTag`)
where `vbAtomListUsed && exprIsAtomList` holds, and the list kind's (`scalarTagOfKind(7)`)
otherwise. `holeBoxPlanOf` returned the ladder for every atom list.

## The change

- `HoleBoxArm` gains `atomList`. The plan names it exactly where legacy's tag condition holds;
  every other atom list takes the `atom` arm at kind 7. `holeBoxHead` writes the arm's tag,
  `emitHoleBox` the list, and `holeBoxTail` the box (`atomBoxTail`). Legacy now writes these boxes
  through `emitHoleBox`. ir-identity `--names` and `--cases` compare its bytes.
- The IR takes the arm as a list value (`boxPlanWhy`, `boxOp`) and as a leading head
  (`holeBoxLeads`).

Covered = matched over the files the ladder census named: 566 → 582. The rest of the 43 carry a
second blocker (`index none`, `is storage rung`). The `f64[]` literal boxed into a recursive
`Json` (25) is another rung, the nested ref-list's.

Row file `tests/ir-shadow-rows/literal-union-list-boxed.vl`; witnesses
`tests/cases/unions/literal-union-list-boxed-under-its-arm-tag.vl` and
`tests/cases/unions/literal-union-list-boxed-beside-a-record.vl`.
