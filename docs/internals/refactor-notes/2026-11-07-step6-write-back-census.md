# Step 6's write-back census: sixteen `synth*Ann*`, and `criWalkBlock`

Measured on 2026-11-07 at `ac6882d5` over tests/cases and the distilled corpus (19,355 files).

## What each write-back holds

A probe snapshotted the annotation field it writes (`letType`, `fnRet`, `parType`) before and
after each call and counted every write, one count per write. Each written annotation's recorded
type was compared with the checker's own type of the node (`nodeTyIxOf`, or its result for a
function): `eq` is the same type, `ne` a different one, `none` no type to compare. The ablation
made the write-back a no-op and rebuilt the files it fired on. Movers are files whose output
wasm or refusal changed.

| write-back | writes (eq/ne/none) | files | ablated: movers | outcome |
|---|---|---|---|---|
| `synthNarrowedReadAnn` (+ `synthCellNarrowedReadAnn`) | 5/0/0 | 4 | 0 | deleted |
| `synthCaptureReadAnns` pass | 29/1/0 | 9 | 0 | deleted |
| `synthCaptureCopyAnn` (+ `synthAnnBankRlSlot`) | 25/1/0 | 8 | 0 | deleted |
| `synthCaptureEmptyListAnns` pass | 23/0/1 | 19 | 0 | deleted |
| `synthRetPinAnn` | 35/0/0 | 33 | 0 | deleted |
| `synthGlobalEmptyListAnns` pass | 81/0/4 | 48 | 0 | deleted |
| `synthJoinedRecordAnn` | 87/6/0 | 78 | 0 | deleted |
| `synthEmptyListAnn` | 255/0/6 | 155 | 0 | deleted |
| `synthNullHoleAnn` | 26/0/0 | 10 | 1 (builds → refuses) | parked |
| `synthNulListRetAnns` | 178/0/0 | 115 | 9 (6 build → refuses) | parked |
| `synthParamAnnots` | 1,051/0/0 | 315 | 135 (103 build → refuses) | parked |
| `synthRetAnnots` | 1,028/0/1 | 564 | 66 (58 build → refuses) | parked |
| `synthRecordedRetAnnots` | 9,629/7/95 | 2,939 | 2 (same output) | parked, step 7 |
| `synthAnnOfTy` | helper | | | kept: two callers stand |

Ten of the sixteen names go: the eight write-backs above and two helpers only they called. Eight more functions only they reached go too (`captureCopyAnnotates`, `narrowedReadPrimAnnotates`, `cboxReadCellTy`, `armPinAnnName`, `armPinLitInit`, `pinArmDeepUncontestedTy`, `arrElemNominalOfTy`, `letListDestKindConflict`). The pass rows count the per-binding writes they make too. With all eight deleted at once, the
full sweep moves 0 of 19,355 files.

## The parked write-backs: the fact is held, the reader is missing

Every parked write-back stores a type the checker already holds (`ne` is 0 in four of the five).
What is missing is a reader: the emitter sites downstream read the annotation's syntax, and they
have no arm that reads the node's type.

- `synthNullHoleAnn`: witness `tests/cases/inference/null-hole-filled-by-write.vl`. The union
  registration and the `T | null` cell read `letType`.
- `synthNulListRetAnns`: witness `tests/cases/functions/return-join-two-list-types.vl`. The
  `fRetKind` cascade reads `fnRet`, and has no inferred nullable-list or list-union arm.
- `synthParamAnnots`: witness `tests/cases/arrays/f64-map-filter-lambda.vl`. A parameter's slot
  and sig classification reads `parType`.
- `synthRetAnnots`: witness `tests/cases/closures/chained-closure-nullable-litunion-result.vl`.
  A lambda's functype and `$fnsig` key read `fnRet`.
- `synthRecordedRetAnnots` moves 2 files, both with the same output
  (`closures/generic-lambda-written-let-called-in-two-instances.vl`,
  `maps/join-of-two-map-types.vl`). It is the bridge that hands `buildFnMap` the recorded result,
  so it goes when step 7 deletes `buildFnMap`. Deleting it here would move that work back onto
  the body derivation.

Each of the four needs the reader's own arm to read the recorded type (step 7's `repOf(ty)`),
not a new checker fact.

## `criWalkBlock`

It no longer replays any narrowing. It walks a function's `return` sites (each `if` arm, and an
anonymous lambda's tail values) and hands each to `criClassify`. Neither pushes or reads a
narrowing. It is `computeRetInference`'s walk, so it is deleted with that pass in step 7.

## Cost

| measure | `ac6882d5` | batch 1 |
|---|---|---|
| seed bytes (fixpoint) | 6,425,129 | 6,421,342 (−3,787) |
| L2 self-compile fuel | 74,994,112,464 | 74,747,882,836 (−0.33%) |
| plumb-shape main fuel | 8,667,028,090 | 8,618,514,064 (−0.56%) |
| plumb-shape tail fuel | 6,286,376,244 | 6,245,914,261 (−0.64%) |
