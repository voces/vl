# Step 7: the inferred list result reads its recorded row; `rlSlotByNameTwin` goes (2026-11-08)

#6825 left `rlSlotByNameTwin` in two places, `fnRetRefListDemand` and `fnRetRefListRowJoin`.
Both looked up `fRetRArrElem[i]` by name. This PR switches both to a typed row and deletes
`rlSlotByNameTwin`.

## The fact was already recorded

The brief expected two missing facts: the declared destination's record row (3 files) and a
hole call's per-instance result row (12 files). A probe showed both are already in
`fnRecordedRetTy`. For D14223 the recorded result is `Circle[]`, the destination the delivery
fitted, while the checked type is `{r: {c2: i32}} | {r: {s2: i32}}`. For D9716 it is the
elaborated `((i32) => i32)[][]`, where the checked element is `_`. The name was never
an independent fact. `criColsFromRecorded` writes it as `rlElemName[frcRow]`, with `frcRow =
repSlotOfKind("reflist", recorded)`.

## Change (emit_collect.vl, emit_shape_rows.vl)

* `fnRetColsFromRecorded` passes `rec`, the `frcRow` that `criColsFromRecorded` read, to both
  functions. It is -1 when the recorded columns were not read.
* `fnRetRefListDemand(i, rec)` interns nothing when `rec >= 0`.
* `fnRetRefListRowJoin(i, rec)` returns `rec`, unless the recorded type holds a function and a
  returned list literal's own elements hold different function sets (`retListLitSetsSplit`).
  That case answers -2, as before.
* `rlSlotByNameTwin` is deleted.

The -2 guard is needed. A first candidate took `rec` unconditionally, and 3 files that are a
loud emit reject on master became compiler traps: `d15221_slice_half`, `d15221_sliceb_half` and
`d15294_two_records_called`. There the row is an anonymous record (`#anon0`), whose name does not
round-trip through `rlSlotByNameK`. So the name rung missed, and the values' join refused. A
second candidate refused on any sig disagreement. It lost 10 `runs`, for example
`inferred-return-list-join*` and `closure-value-2d-*`, where the element holds no function. The
narrowed rule matches those 3 files and none of the 10.

## Probe (not committed; `$VL_LATE_DEMANDS`, `vl check --batch --codegen`, 23,679 files)

At every name hit it compared the name's row against `repSlotOfKind("reflist", fnRecordedRetTy)`.

| measure | count |
| --- | --- |
| name hits | 1,200 in 933 files |
| recorded row differs from the name's | 0 |
| join: typed (checked-type) path differs from the name's | 20 in 16 files |
| demand: typed path would intern | 4 in 3 files |

## Callers of the name path

| caller | before | after |
| --- | --- | --- |
| `rlSlotByNameTwin` in `fnRetRefListDemand` | 933 files | deleted |
| `rlSlotByNameTwin` in `fnRetRefListRowJoin` | 933 files | deleted |
| `rlSlotByNameTwin` | 1 export | deleted |

## Proof

| check | result |
| --- | --- |
| fixpoint | byte-identical second refresh, before and after the master merge |
| sweep vs master `ea3c74ca` fixpoint | 23,679 of 23,679 records identical, 0 runs → not-runs |
| seed | 6,526,280 → 6,526,283 (+3) |
| rep-fuzz-check | exact, 0 baselined failures |

`fRetRArrElem` is still written and read elsewhere, by `repDescRet` and `fn_ret_shadow`. Only
its by-name row lookup in this pass is gone.
