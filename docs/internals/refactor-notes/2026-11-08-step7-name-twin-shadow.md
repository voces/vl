# Step 7: the name-twin family, shadowed per caller (2026-11-08)

`rlSlotByNameTwin(name, ty)` answers the row a ref-list element NAME keys, else a layout twin of
`ty`. `letInitDeliversRow` answers whether an un-annotated `let` binds the row its initializer
delivers rather than the row its element type keys. Both are names standing in for a rep the type
should carry (`repOf(ty)`).

## Method

A probe at every call recorded `(site, class)`: `agree` when the name answer equals a typed answer,
otherwise `nameOnly` (only the name finds a row), `tyOnly` or `differ`, and the element type's kind
for a disagreement. It ran through `repABNote` under `$VL_REP_SHADOW`, with one `vl build` per
program of the sweep population (23,633 programs, `sweep.vl list`). The probe fired on a control
before the run, and the per-site `agree` counts show it was live at each site it reports. The
probe was not committed.

Typed answers tried: `rlSlotOfTyOrTwin(et)` (the type's row, else its layout twin);
`rlSlotOfRowTy(rlRowTyOfElem(et))` (W: the row the element is minted under, so a closure maps to
its row signature); and, for `refListSlotOfExpr`, the per-instance type (`instanceTyOf`) and the rep
type (`exprRepTy`).

## Per caller (files; a file can sit in two classes)

| caller | agree | nameOnly | tyOnly | differ | verdict |
| --- | --- | --- | --- | --- | --- |
| `criJoinedListKind` same-row test | 0 | 0 | 0 | 0 | no program reaches it; switched |
| `criRetRefListElemName`, expression's name | 0 | 0 | 0 | 0 | no program reaches it; switched |
| `criRetRefListElemName`, returned local | 11 | 0 | 0 | 0 | switched |
| `refListSlotOfExpr` (`rlSlotOfTyOrTwin`) | 615 | 144 | 1 | 2 | stays |
| `refListSlotOfExpr` (W) | 669 | 82 | 1 | 21 | stays |
| `refListElemNameOfIndex`, outer row | 9 | 5 | 0 | 0 | stays (all 5 open) |
| `fnRetRefListDemand` (W) | 848 | 58 | 19 | 0 | stays |
| `fnRetRefListRowJoin` (W) | 845 | 58 | 23 | 0 | stays |
| `letInitDeliversRow`, named call | 46 | 3 | 0 | 0 | stays |
| `letInitDeliversRow`, generic closure | 40 | 2 | 0 | 3 | stays |

## The missing facts, by class

* **Open closure element**, 138 of the 144 `refListSlotOfExpr` disagreements, and 68 of 96 at the
  pair of `fnRetRefList` callers. An un-annotated lambda in a list (`const fs = [(y) => y + "C"]`,
  D12301, D12215, D6914) has a generic signature. Its row is minted at the bound signature, which the
  read's type does not carry. `instanceTyOf` closes none of them (the frame has no instance). W
  closes about 60 at `refListSlotOfExpr` and 20 at each `fnRetRefList` caller, and moves 20 to
  `differ`. Missing fact: the closure value's bound row signature, recorded on the node (step 3/4).
* **Hole element**, 25 files at each `fnRetRefList` caller. `fnRetRArrElemTy` is -1: the recorded
  result holds no element type. Missing fact: the elaboration's per-instance result.
* **Record or union element at a delivered row**, 3 files at `fnRetRefListDemand` (D14223) and 2 at
  `letInitDeliversRow`'s named call (D14813, `record-call-list-handed-back-by-generic-runs`). The
  list is built at a declared or callee row (`Circle`), and the element is the literal's record. The
  type keys no row, so a type-keyed reader would mint a second one. Missing fact: the kept
  delivery's row, per binding (the step 6 storage column).
* **Nullable or record storage**, 7 files at `refListSlotOfExpr`. The slot is the storage rep, and
  the checker's type is narrower. Same column.

## Left

`rlSlotByNameTwin`: 4 callers (`refListSlotOfExpr`, `refListElemNameOfIndex`,
`fnRetRefListDemand`, `fnRetRefListRowJoin`). The last two pass no twin type, so they are a pure
name lookup. `letInitDeliversRow` stands, with both of its cases.
