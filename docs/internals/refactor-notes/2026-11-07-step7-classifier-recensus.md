# Step 7 re-census: the type-blind classifiers by caller phase, 2026-11-07

Measured on master `df635dbd` over 19,358 files (`tests/cases/**/*.vl` and
`scripts/silent-sweep/distilled/**/*.vl`). 14,654 of them reach at least one classifier.
The 2026-11-02 census used 17,630 files, so compare the counts by class, not call by call.

**Population.** `scripts/rep-classifier-census.vl --json`, keeping the rows in
`compiler/emit_classify.vl` whose `reads` set holds no `ARENA`. That gives 113 functions
and 3,156 lines (116 and 3,180 on 11-02). Three left the population because they now read
`repOfNode`: `exprNulScalarListKind`, `minMaxKind` and `callIsArrSlice`.

**Method.** I built an instrumented compiler in scratch (no part of it is committed). It
puts a counter at each classifier's entry, keyed by function, call site, and whether
`emitPhaseReached("monomorphized")`. It also wraps the last argument of every direct call
(589 sites), so the entry counter knows which caller made the call. The counts come out
through `$VL_REP_SHADOW`'s `unsup` lines.

| class | functions | lines |
| --- | --- | --- |
| Called only after monomorphize | 5 | 172 |
| Called only before monomorphize | 4 | 50 |
| Called in both phases | 96 | 2,785 |
| The storage column (stays) | 8 | 149 |

The 96 functions called in both phases are the same set as on 11-02. None of them has
become post-monomorphize-only. The fewest pre-monomorphize calls are in
`loopVarReadIsAtom` (2, from `loopVarPinTyOf`), `moduleCopySigKey` (2, from
`calleeCloSigKeyOfRead`), `forInVarIsLitAtom` (18, from `loopVarCellGo`) and
`letRefListElemName` (22, from `criRetRefListElemName` and `refListElemNameOfIdent`).
The PR body holds the full per-function table, with each function's top pre-monomorphize
callers.

## The five called only after monomorphize, shadowed against a typed reader

| classifier | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `mapRetExprShape` | `mapShapeOfTyPeeled(nodeTyAt(rx, fn))` | 143 | 0 | deleted |
| `forInVarStructIdx` | elem `repOfTy` kind → slot | 7,339 | 175 | kept |
| `callLoweredKindOf` | `repOfNode(rx).rdKind` | 8 | 18 | kept |
| `vkNonNullRefTwin` | — (a VKind→VKind table) | | | not a node classifier |
| `recBuildRowOf` | — (the checker's record solve) | | | not a node classifier |

**`forInVarStructIdx`.** The typed answer agrees with the old one on every element
*kind*. Every disagreement is a struct or nulstruct element where `repOfTy(elem).rdSlot`
is `-1` and the old answer is a real row: a record spelled by shape, or an inline record,
has no slot at the arena level (`repSlotOfTy`). Witness:
`scripts/silent-sweep/distilled/named/d3125_hole_FR_H_P2_0.vl` (110 asks, old `0`, typed
`-1`). Before this classifier can go, `repSlotOfTy` has to name the row that `rlSlotOfTy`
finds for a shape-spelled record.

**`callLoweredKindOf`.** This one is built to report the result kind the callee
*lowers*, which can differ from the rep of the call's own type. Witnesses:
`distilled/named/d341_arr3_str_match_null_in1.vl` (old none, typed `nulreflist`) and
`tests/cases/maps/literal-subscript-narrow.vl` (old none, typed `nulstruct` / `nullist`).
It is not a rep-from-syntax classifier.

## The four called only before monomorphize

`letIsClosure` 594 calls (88 files, all from `letInitCellKind`), `arrLitRefListRow` 87
(68), `letInitLoopElemKind` 7 (3) and `letIsNulRefArray` 4 (4). They answer at template
types, so the typed reader at the instance is not the one to compare them against.
