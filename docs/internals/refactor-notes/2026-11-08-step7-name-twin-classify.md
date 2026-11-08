# Step 7: the classifier's name-twin lookups go (2026-11-08)

#6818 left 19 files reaching `rlSlotByNameTwin` in `refListSlotOfExpr`. This PR switches
that rung, `refListElemNameOfIndex`'s name rung and `letInitDeliversRow` to typed rows, and
measures the fourth caller (`fnRetRefListDemand` / `fnRetRefListRowJoin`), which stays.

## Change (emit_classify.vl)

* `refListSlotOfExpr`'s name rung is gone. A named function call reads its function's joined
  result row (`fnRetRefListSlot`), a paren its inner read's row and an if-expression its join
  row (`ifExprRefSlot`). Every other read takes the row its element type keys
  (`rlSlotOfTyOrTwin`).
* `refListElemNameOfIndex` reads the receiver's row from `refListSlotOfExpr`, not from its name.
* `letTailRowSlot` no longer asks `letInitDeliversRow`. A literal with no spread keeps its own
  row. Any other initializer binds the row it delivers, falling back to the element type's row.
  `letInitDeliversRow` is deleted.

## Probe (not committed)

`elabShadowNote` pushed one tag per read onto the `$VL_LATE_DEMANDS` list. The tag gave the
site, the read kind and whether the typed answer agreed with the name's. It ran over the
23,670 files `sweep.vl -- list` names, with `vl build`, 4 jobs.

Outcome columns count (file, outcome) pairs: one file can carry two outcomes.

| site | files | agree | both miss | name misses | typed misses | differ |
| --- | --- | --- | --- | --- | --- | --- |
| A `refListSlotOfExpr` name rung | 19 | 9 | 9 | 1 | 0 | 0 |
| B `refListElemNameOfIndex` name rung | 14 | 15 | 0 | 0 | 0 | 0 |
| C `letInitDeliversRow` true | 94 | 89 | 0 | 0 | 6 | 1 |
| C' un-annotated `let`, not delivering | 388 | 468 | 13 | 0 | 19 | 2 |
| E `fnRetRefListRowJoin` name hit | 928 | 917 | 0 | 0 | 12 | 3 |

D (`fnRetRefListDemand`'s name hit) is reached in the same 928 files. In 925 of them the
typed path also returns without interning: 828 because the type keys a row, 68 because it holds
a type variable, 31 because there is no type. In 3 files it would intern a new row.

At A, the 9 both-miss pairs are kinds `literal`, `member`, `index` and `binexpr`. The
name-miss pair is `d15203_cell_if_return`, and its sweep record does not move. A first probe
used the element type's row alone, and it missed in 3 name-hit files: `paren`, `if` and a
hole-function call. The Paren, if and call rungs above close all 3. At C, the 7 typed-miss and
differ pairs are reads that `refListSlotOfExpr` already answered, and they still return that
answer. At C', all 21 movers are literals, which is why a literal keeps `arrLitRowSlotIn`.

## Sweep (fixpoint seeds, base = master `dfc71a0a`, candidate)

23,670 of 23,670 records identical (module bytes and stdout), 0 runs → not-runs. Seed
6,525,260 → 6,525,307 bytes (+47). rep-fuzz-check exact. The same held before the master
merge, against `28406f9c` + #6818.

## Callers of the name path, files reached

| caller | before | after |
| --- | --- | --- |
| `rlSlotByNameTwin` in `refListSlotOfExpr` | 19 | deleted |
| `rlSlotByNameTwin` in `refListElemNameOfIndex` | 14 | deleted |
| `letInitDeliversRow` | 94 | deleted |
| `rlSlotByNameTwin` in `fnRetRefListDemand` | 928 | 928 |
| `rlSlotByNameTwin` in `fnRetRefListRowJoin` | 928 | 928 |

## Left: the inferred list result's name (emit_collect.vl)

`fRetRArrElem`'s name keys a row that the typed path does not reach in 15 files:

* 3 files with a closed element type keying no row: D14223, `list-fresh-call-bare-literal-
  into-record-list` and `narrow-literal-list-builds-at-arm`. The function returns a literal of
  records the declared destination names, and the name keys the destination's row. Without
  the name, `fnRetRefListDemand` would intern a second row.
* 12 files whose element holds a type variable, where the returned values' join misses (9) or
  picks another row (3). These are hole-function results, such as `g(g(x))` over a hole
  parameter, D9716, D9764 and D15229. They need a row recorded for the returned call.

`rlSlotByNameTwin` stays until both classes have a producer.
