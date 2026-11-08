# Step 7: classifier round 10, 2026-11-08

Round 10 takes the "both" classifiers with the fewest pre-mono askers (`classifier-census.vl
--callers`), names each one's pre-mono asker, and switches the asker or the classifier to a typed
fact where a shadow agrees. Counts are over the 23,650-program sweep population.

**Finding the asker.** The census names only the direct caller. A scratch compiler built with
`--names`, whose ten target classifiers trap when `emitPhase` is `passes` or `monomorphizing`,
gives the whole chain. Of the 25 pre-mono calls, 17 are made inside mono and 8 in the passes before it. A run traps at its
first such call, so a second classifier in the same program (`letIsRefArray`,
`cloPinnedListElemKey`) is placed by its census caller:

| asker | classifiers reached |
| --- | --- |
| mono's lambda pin (`monoLamPinRetAnn` → `fnRetExprOf` → `stmtIsTailValue`) | `cloArrElemSelfKey`, `cloPinnedListElemKey`, `letIsRefArray`, `forInMapWalksVals`, `bindingIsNulLitUnion` (via `calleeIsVoidExtern` → `captureValKind`) |
| `dispatchRewrite`, `drwWalkIndex` (`drwFieldRowOf` → `structIndexOfExpr`) | `callResultIsLitAtom` (through `globalCellKind`) |
| `dispatchRewrite`, `drwWalkMemberCall` (`exprIsClosure`) | `idxRecvIsStrList`, `letRefListElemName`; `readNulVKind` (2) through the same `memberUnionFieldNameRead` chain |
| `monoArgTyNameRep` → `exprString` (`emit_mono.vl`) | `readNulVKind` (1), `exprIsStrConcat` |

**Shadows** (old answer / typed answer, per call or per batch line):

| classifier or ask | typed reader | agree | disagree | outcome |
| --- | --- | --- | --- | --- |
| `idxRecvIsStrList` | `nodeRepIs(recv, "strlist")` | all | 0 | deleted |
| `letIsRefArray` | `letBindRepKind == "reflist"` | all | 0 | deleted |
| `forInMapWalksVals` | receiver's checked map type, not a set | 3,635 | 0 | deleted → `forInWalksMapValues` (`emit_ty_canon.vl`) |
| `drwWalkIndex` `"[]"` field | `tyFieldTyOf(recv ty, "[]")` is `TyFunc` | 28 | 0 | typed (`drwRecvFieldIsFn`), also the `"[]="` and inline-read sites |
| `exprIsStrConcat` | `repOfNode(bin).rdKind == "str"` | 14,241 lines | 41 lines `T/F` | kept: `+` over type parameters in a generic template |
| `drwWalkMemberCall` `exprIsClosure` | receiver type open (hole or type variable) | 209 | 8 closures at a closed receiver | kept |

The first `forInMapWalksVals` shadow read the map test without the set test and disagreed on 7
set walks. `mapShapeOfTyPeeled` has no set shape, and `TyMap.mSet` is the fact.

**Not type-blind.** `bindingIsNulLitUnion` reads the binding-cell rep (`letBindIsNulAtom`,
`nodeRepIsNulAtom`), and `readNulVKind` maps a kind string to a `VKind`. The census lists both
because neither body carries a token from `rep-classifier-census.vl`'s ARENA list.

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | probed |
| --- | --- | --- | --- | --- |
| master `3ede28b4` | 20 | 0 | 70 | 90 |
| this PR | CENSUS_AFTER |

**`readCellKind`'s code ladder (item 2) is parked.** Its 879 fallback calls have no storage type
it can use. A type-variable row's field could be read at the instance from the receiver's type
(`tyFieldTyOf(nodeTyAt(memObj, fnIx), prop)`, with the code-15 nullable rule), which needs its
own shadow. The `nulnone` hole rows would need the hole's record, and that is not recorded yet.

**Proof.** Both seeds are fixpoints: base (master `3ede28b4`) 6,515,515 bytes, candidate
6,514,987 (−528). Sweep over 23,650 programs: 23,650 same, 0 bytes-only, 0 output movers,
0 `runs → not-runs`, 0 new traps.
