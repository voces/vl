# Step 7: `refListElemNameOfExprRaw` deleted; a row-less list names its element record's row, 2026-11-10

Group 10 of `2026-11-09-step7-classifiers-remaining.md`, after #7070, which made `listRowOfExpr`
answer the function-value list rows. Base is master `e860b760`, whose fixpoint seed is 6,601,153
bytes. Counts are post-mono calls over the 23,838-program sweep population.

`refListElemNameOfExpr` asks `listRowOfExpr` first and fell back to `refListElemNameOfExprRaw`,
a by-shape walk over calls, names, fields, indexes, joins and concatenations. After #7070 the walk
is entered 3 times in 3 files, and every one is an `__array_new__(n, { … })` record fill whose
call type keys no row (`arm-element-list-mutation.vl`, `array-new-ref-elems.vl`,
`d1629_object_literal_fill.vl`).

| twin, shadowed at those 3 calls | agree |
| --- | --- |
| `rlRowNameOfTy` of `nodeTyAt`'s element | 1 (the other two render the structural `{x:i32}` where the row is `P`) |
| the destination's instance type row (`refListElemNameOfInstTy`) | 0 |
| the element record's canonical struct row (`structRowOfRecordTy`) | 3 |

## Switched

Past `listRowOfExpr`, `refListElemNameOfExpr` answers a ref list's element record's canonical
row, else "". The walk is deleted, and so are the four name walkers only it called
(`refListElemNameOfCall`, `…Ident`, `…Member`, `…Index`), the three helpers only they called
(`mapReadStructListMvSlot`, `refListElemNameOfNodeTy`, `refListElemNameOfInstTy`), the three
exports that were dead after that (`arrLitElemNameIn`, `instAnnTyNameOfExpr`,
`recordListSlotOfNode`), and eight imports: 423 lines. The `refListKeptSlotOf*` slot readers stay, because `refListSlotOfUntyped`
asks them.

## Census (`classifier-census.vl`)

| tree | probed |
| --- | --- |
| base `e860b760` | 14 |
| this PR | 13 |

**Proof.** The fixpoint seed is 6,596,100 bytes (−5,053). Two `refresh-compiler.sh` runs are
byte-identical.

* The 3 files that reach the walk build byte-identical wasm against the base's fixpoint. The
  deleted code is reachable only through the walk, so no other program can move. The `sweep`
  label re-proves the whole population.
* `rep-fuzz-check.sh`: exact.
* `lint-self.sh`: clean.
* `seed-size --check`: +0.1%.
* `late-demands --check`: 6, the baseline.
* Dead-export budget: 0.
* `cases_wasm_*`, `vl_cls_census`, `vl_inventory_refs`, `vl_inventory_rows`, `vl_scaling_shape`:
  7,503 passed, 0 failed.
* `check-filed-witnesses --strict` on both inventories: 4,686 as filed, 0 moved, 0 output mismatch.
