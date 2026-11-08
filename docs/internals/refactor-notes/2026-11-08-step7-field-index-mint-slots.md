# Step 7: field, index and list-literal reads take their storage row (2026-11-08)

#6795 and #6812 gave identifier, list-literal and call reads their rungs' row slot before
`rlSlotByNameTwin`. This does the same for field reads and index reads. It also gives a
list literal the row the intern pass minted it at, which covers the record classes.

## Change

* `refListKeptSlotOfMember` (emit_classify.vl) walks `refListElemNameOfMember`'s rungs in
  its order. Each rung returns the field's storage row: `variantFieldRefSlot` for a narrowed or
  arm receiver's variant field, `sFieldRefSlot` for a struct field. A narrowed place and the
  shared-union rung return -2 (the name only).
* `refListKeptSlotOfIndex` returns the receiver's own slot's inner row (`rlElemInnerSlot`)
  under the same self-key check `refListElemNameOfIndex` applies to the name's row. The
  receiver's slot comes from `refListSlotOfExpr`, not from its name.
* `arrLitRlSlot` (emit_state.vl, written by `recordArrLitRlSlot`) is the row
  `collectA` interns a list literal's elements at (`rlInternNameTy(arrLitElemName(i, -1), ..)`).
  It is recorded at the producer as its own column, not on `litRepTyAt`. `refListSlotOfExpr`
  reads it after the literal's rungs return -2.

## Shadow (files, sweep population, 23,664 programs, including failing compiles)

A probe at the name lookup compared each candidate with the name's slot. It was not committed.
It reported through `$VL_LATE_DEMANDS`, so programs that fail to emit are counted too. That is
why the base here is 156 files, not #6812's 142.

| read kind | files | agree | nameOnly | differ |
| --- | --- | --- | --- | --- |
| list literal, minted row | 88 | 84 | 0 | 4 |
| field read | 46 | 41 | 5 | 0 |
| index read | 21 | 20 | 1 | 0 |

The 4 literal differs are D15301, D9482, `if-choice-of-hole-fn-records-in-list` and
`hole-fn-generic-pushed-list-spread`, all lists of records holding hole functions. Two of them
miss at the name (D15301's `a ref list's element row does not resolve` family) and two hit
another row. All four print the same output on both seeds.

## Sweep (fixpoint seeds, master `756273a1` and candidate)

23,663 same, 1 bytes-only mover (`hole-fn-generic-pushed-list-spread`, one of the 4 differs;
same output), 0 output movers, 0 runs → not-runs, 0 new compiler traps. Seed 6,515,832 →
6,516,799 bytes (+0.015%).

## Files reaching `rlSlotByNameTwin` in `refListSlotOfExpr`

| | all | list literal | call | member | index | other |
| --- | --- | --- | --- | --- | --- | --- |
| before (master) | 156 | 88 | 2 | 46 | 21 | 6 |
| after | 19 | 5 | 2 | 5 | 1 | 6 |

## Left

* List literal, 5 files: no minted row and no name row (both miss).
* Field read, 5 files: a narrowed place (`placeReadContainerAt`) or a shared-union field.
* Index read, 1 file: a narrowed index place.
* Call 2 and other 6: unchanged (fact 2; `+`, `if`, `??`).
* `rlSlotByNameTwin`, `letInitDeliversRow`, `refListElemNameOfIndex`'s name rung and
  `fnRetRefListDemand`/`RowJoin` stand.
