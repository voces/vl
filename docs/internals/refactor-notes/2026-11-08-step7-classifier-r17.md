# Step 7: classifier round 17, the pre-mono hubs, 2026-11-08

Round 17 starts from master `2a59f035` with r16 (#6838) merged. Counts are calls over the 23,688-
program sweep population, read from `classifier-census.vl --callers --keep` and from
`clsCensusEnter("SH …")` shadow keys in a scratch compiler, as r16 did.

**Finding the asker.** A scratch `--names` compiler whose nine smallest "both" classifiers trap
before `monomorphized` gives each pre-mono call's whole chain. Nearly every chain enters through a
mono pin (`monoArgTyNameRep`, `monoArgTyNameCascade`, `monoLamPinRetAnn`, all in `emit_mono.vl`)
asking one of a few hub predicates, and the hubs then reach the classifiers. So the hubs move, not
the mono askers: before mono each hub answers from the checked type.

| hub (pre-mono asks) | typed reader before mono | agree | disagree |
| --- | --- | --- | --- |
| `exprString` | `nodeRepIs(ix, "str")` | 428 (all F) | 0 |
| `exprUnion` | `nodeRepIs(ix, "union")` | 298 (all F) | 0 |
| `exprMap` | `nodeRepIs(ix, "map")` | 109 (all F) | 0 |
| `exprIsBool`, below its three typed rungs | those rungs | 19 (all F) | 0 |
| `exprListRep` | `listColumnDesc` → `listOfColumn` | 2,769 | 0 (63 uncovered, both none) |
| `identIsBoundClosure`'s capture rung | `tyIsFuncOrNulFunc(nodeTyAt)` | 3 | 0 |

The capture rung asked `capturedKindOf` 269 times before mono, and 266 answered null: the name
was not a capture. Before mono the rung now asks membership (`fnCapturesName`) and reads the
read's checked type for a capture. Shadowing the whole of `identIsBoundClosure` against the
checked type disagrees on 10 calls in 8 programs (D14883, D15451, the
`error-generic-handed-to-bare-param-*` pair): a binding read at a generic template, whose type
is a type variable or a hole. So the other rungs are not switched.

**Census** (`classifier-census.vl --callers`, 75 probed):

| tree | post-only | pre-only | both | uncalled |
| --- | --- | --- | --- | --- |
| master `2a59f035` + r16 | 35 | 0 | 40 | 0 |
| this PR | 54 | 0 | 21 | 0 |

The 19 that became post-only are `callStoreListKind`, `calleeRetKindOfRead`, `captureValKind`,
`cloArrCallRetKind`, `columnListRepOfRead`, `exprIsLitAtom`, `exprIsNulNone`, `exprIsStrMethod`,
`exprNulLitUnion`, `exprUnionCall`, `identCellVKind`, `identStoreVKind`, `letCellKindGo`,
`letInitIsNulLitBox`, `letIsMap`, `letIsNulNone`, `readKindIsNul`, `readListKindOf` and
`unionIdentReadKind`. `capturedKindOf` falls from 501 to 2 and `nulVariantIdxOfExpr` from 34 to 26. `exprListRep` (2,832) and `identIsBoundClosure` (271) stay "both" by entry count. Mono
still enters them, but before mono `exprListRep` answers from the column and the capture rung
from the type. `memberUnionFieldName`, `armFieldUnionName` and `memberIsClosure` (7 each) stay,
as r16 said.

**Left.** The `arrLit*` family (`arrLitIsRefTpl` 930, `arrLitNumKind` 196, `arrLitRefListRow` 104,
`arrLitElemNameTpl`/`arrLitInstElemRow` 87, `arrLitObjElemBoxVariant` 14) is asked through
`arrLitElemName` and `arrLitIsRef` from `monoArgTyNameRep`. The closure-return family
(`fnSigKeyOf`, `cloRetKindOf`, `cloRetValKind`, `blockTailIsClosure`, `exprIsClosureNoLocal`, 20 to
25 each) is asked through `monoArgTyNameCascade` and is next to lane w126's `cloRet*` rows.
`letCellSlot`'s reflist and struct arms (r16) were not taken.

**Proof.** `scripts/gate.sh` on the final tree: all 23 rows pass. Both sides are fixpoint seeds: base 6,541,414 bytes, this PR 6,541,878 (+464).
The sweep over 23,688 programs: 23,688 same, 0 bytes-only, 0 output movers, 0 `runs → not-runs`,
0 new traps. The seed reads +2.3% against the size baseline, under the +3% bar.
