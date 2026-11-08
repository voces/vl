# Step 7: a read's kept row slot before its element name (2026-11-08)

`refListSlotOfExpr` asked `refListElemNameOfExpr` for a name and then `rlSlotByNameTwin` for that
name's row. For an identifier, most of the name's rungs had a row slot in hand: the slot a local
is declared at (`localStructIdx`), a global's cell (`letRefListSlot`), a capture's env field, a
narrowed arm's row. The rung rendered the slot to `rlElemName` and the lookup parsed it back.

## Change

* `refListKeptSlotOfExpr` / `refListKeptSlotOfIdent` (emit_classify.vl) walk
  `refListElemNameOfIdent`'s rungs in its order and return the slot itself. A rung that has only a
  name (a narrowed union read, a parameter's annotation, a global's declared element) returns -2.
* `refListSlotOfExpr` reads the rep's row, then the kept slot, then for a bare identifier at a
  -2 rung the row its own type keys (`rlSlotOfTyOrTwin`). Only other read kinds reach the name.
* `declaredRefArraySlot` (emit_obj_lit_fits.vl) is `declaredRefArrayName` without the render.

## Shadow (files, `tests/cases` + `scripts/silent-sweep/distilled`, 19,387 programs)

Before, 622 files reached the name lookup. A probe compared the kept slot with the name's answer
at every call that reached it: 458 files `agree`, 22 agree on "no list", **0 differ**. At the
-2 rungs, identifiers: 57 files, all agree with `rlSlotOfTyOrTwin`. The probe's per-site `agree`
counts show it ran at every site it reports. It was not committed.

| at the name lookup | files | T agree | T nameOnly (open / obj) | W agree | W nameOnly | W differ |
| --- | --- | --- | --- | --- | --- | --- |
| before (all reads) | 622 | 526 | 96 / 2 | 560 | 57 | 18 |
| after (non-identifiers) | 311 | 258 | 52 / 2 | 292 | 13 | 10 |

T is `rlSlotOfTyOrTwin(elem)`, W is `rlSlotOfRowTy(rlRowTyOfElem(elem))` at the instance type.
After, by kind (T): array literal 168 files (36 open nameOnly), call 116 (8 open, 2 record),
member 40 (8 open, 1 differ), index 10 (4 open), other 4, `if` 1, `+` 1.

## The one mover

D15301 (`[if c { { f: id1 } } else { { f: id2 } }]` as a global) moves `emit reject → runs`.
The global's cell keeps a row, and the element name rendered from it keys none
(`a ref list's element row does not resolve`). So the round trip was lossy for a choice of hole-fn
records. `capability-matrix.vl -- if-arm-record-fn-field-two-members`: `array_element`
un-annotated `emit refuses → RUNS`, 0 runs → not-runs, 0 silent. The other refusing positions
are D15306's.

## Left for the three facts

* Open closure element: 36 array literal files, plus calls, members and indexes over them. The
  literal's name is its stamped signature render (`arrLitElemRender`), and its rep is open. That
  needs fact 1, the closure set's bound row signature on the literal.
* Record at a delivered row, the 2 call files (D14813). Same as before; fact 3.
* `refListElemNameOfIndex`, `fnRetRefListDemand`/`RowJoin` and `letInitDeliversRow` are not
  changed here.
