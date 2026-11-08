# Step 7: list literal and call reads take their rungs' row slot (2026-11-08)

#6795 gave an identifier read its kept row slot before `rlSlotByNameTwin`. This does the same for
the next two read kinds that reached the name lookup: list literals and calls.

## Change

* `arrLitKeptRowSlot` (emit_classify.vl) walks `arrLitElemNameIn`'s rungs in its order and
  returns the row of the type each one renders: an arena record, a frame's ref type, an
  instance's struct row, a closure list's row signature, and, for the other template arms, the
  element type's row (`arrLitRowSlotIn`). A spread source and a record or union template element
  still return -2 (the name only).
* `arrLitClosureRowTy` (emit_shape_rows.vl) is fact 1: the function type `arrLitElemRender`
  renders for a closure list. That is the recorded element, else the signature every instance
  builds it at (`elabListFnElemTy`), else the opaque stub (D4123).
* `refListKeptSlotOfCall` walks `refListElemNameOfCall`'s rungs and returns the slot each one
  holds. At the rung for a function's recorded result (`fnRetRefArrayNameSid`), it reads the row
  the element is minted under at this instance (`rlSlotOfRowTy(rlRowTyOfElem(..))`). Where that
  finds no row, and at the fill and `.map` rungs that have only a name, it returns -2.

## Fact 1 on `litRepTyAt` was tried and refused

When `litRepTyAt` returned the open closure list's row type for every reader, 375 programs went
runs → not-runs (`ref valtype with no interned shape`) and 12 compilers trapped. The stamp is read
as "build here" by about 20 readers, and for a closure set called at two types (D10082) the stub
is not where the literal is built. So the fact stays at the row reader.

## Shadow (files, sweep population, 23,656 programs)

A probe at the name lookup compared each walk with the name's slot. It was not committed.

| read kind | agree | nameOnly | differ |
| --- | --- | --- | --- |
| list literal, rungs + closure row | 122 | 83 | 0 |
| call, kept slots + instance row at `fnRet` | 126 | 2 | 0 |

`arrLitRowSlotIn` alone disagreed with the name in 5 files: 2 spreads, and 3 lists of records
holding hole functions (D15301, d15203). So record elements stay on the name.

## Files reaching `rlSlotByNameTwin` in `refListSlotOfExpr`

| | all | list literal | call | member | index | other |
| --- | --- | --- | --- | --- | --- | --- |
| before (master + #6795) | 366 | 205 | 128 | 45 | 12 | 6 |
| after | 142 | 83 | 2 | 45 | 12 | 6 |

This population is the whole sweep (23,656 programs), which is larger than #6795's 19,387. So
its 311 is not comparable with the 366 here.

## Left

* List literal, 83 files: record elements at a hole-function or delivered row (`#anon`, 87
  call groups), 2 spreads, and a few nominal records (`P`). These need the per-binding storage
  row (fact 3).
* Call, 2 files: one recorded result with no typed row (a hole), and one `.map` of nullable
  records. That is fact 2 proper: the elaboration's per-instance result element.
* Member 45 and index 12 are not changed here (fact 3).
* `rlSlotByNameTwin`, `letInitDeliversRow`, `refListElemNameOfIndex`'s name rung and
  `fnRetRefListDemand`/`RowJoin` stand.
