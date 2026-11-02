# Type-blind classifiers in `emit_classify.vl`: who calls them, and when

Measured 2026-11-02 on master `a4861e47`, over 17,630 files (`tests/**/*.vl` and the distilled
corpus). The population is `scripts/rep-classifier-census.vl --json`: the classifiers in
`compiler/emit_classify.vl` whose `reads` set holds no `ARENA`, so they read no node type directly.

- **The count.** `emit_classify.vl` holds 179 classifiers (6,113 lines). 116 read no node type
  directly (3,180 lines, 605 call sites), and 108 of those reach the arena through what they call;
  only 8 (106 lines) never do. The plan's 199 / 7,762 was an older count, cut differently.
- **The phases.** Each function's entry was instrumented with a debug-only counter, and each call
  was counted as before or after the `monomorphized` phase. Counts are calls; "files" is how many
  files make at least one such call.
- **The column.** Eight of the 116 are the storage column itself. Readers move onto them, so they
  are not deletion targets.

| class | functions | lines |
| --- | --- | --- |
| Called only after monomorphize | 8 | 210 |
| Called only before monomorphize | 4 | 50 |
| Called in both phases | 96 | 2,773 |
| The storage column (not deletion targets) | 8 | 147 |

A classifier called in both phases is held by its asks before monomorphize. Step 7's "who still
asks before monomorphize" work has to remove those asks before the classifier can go; the counts
below say how many there are.

## Called only after monomorphize

Three of these answer a rep from syntax, and now read the node's rep at its instance
(`repOfNode`). Shadowed over 17,630 files before the move, each had 0 disagreements:

| classifier | agree | rep uncovered | what it read before |
| --- | --- | --- | --- |
| `exprNulScalarListKind` | 341,859 | 220, where both say none | `exprNulKind`'s ladder |
| `minMaxKind` | 2,071 | 0 | the recorded float, then `exprIsF32` / `F64` / `I64` of each operand |
| `callIsArrSlice` | 102 | 0 | `mfRecvKindOf` of the receiver |

The other five are not rep-from-syntax classifiers. `vkNonNullRefTwin` is a VKind table,
`callLoweredKindOf` the call column, `recBuildRowOf` the checker's record solve,
`forInVarStructIdx` a loop variable's slot, and `mapRetExprShape` a return value's map shape.

| classifier | lines | call sites | calls before monomorphize (files) | calls after (files) |
| --- | --- | --- | --- | --- |
| `mapRetExprShape` | 51 | 1 | 0 (0) | 8 (3) |
| `vkNonNullRefTwin` | 40 | 2 | 0 (0) | 311,380 (11845) |
| `recBuildRowOf` | 38 | 2 | 0 (0) | 23,317 (6429) |
| `forInVarStructIdx` | 27 | 2 | 0 (0) | 7,147 (1822) |
| `minMaxKind` | 17 | 1 | 0 (0) | 3,164 (759) |
| `callIsArrSlice` | 16 | 2 | 0 (0) | 150,487 (10262) |
| `callLoweredKindOf` | 16 | 1 | 0 (0) | 26 (22) |
| `exprNulScalarListKind` | 5 | 11 | 0 (0) | 335,975 (12631) |

## Called only before monomorphize

| classifier | lines | call sites | calls before monomorphize (files) | calls after (files) |
| --- | --- | --- | --- | --- |
| `letIsClosure` | 8 | 1 | 618 (102) | 0 (0) |
| `arrLitRefListRow` | 15 | 1 | 70 (53) | 0 (0) |
| `letInitLoopElemKind` | 11 | 2 | 9 (5) | 0 (0) |
| `letIsNulRefArray` | 16 | 2 | 4 (4) | 0 (0) |

## Called in both phases

| classifier | lines | call sites | calls before monomorphize (files) | calls after (files) |
| --- | --- | --- | --- | --- |
| `exprListRep` | 29 | 13 | 233,073 (5497) | 5,848,225 (10326) |
| `listOfColumn` | 7 | 2 | 232,981 (5289) | 5,850,674 (10345) |
| `capturedKindOf` | 13 | 21 | 137,574 (5776) | 3,144,114 (12827) |
| `structIndexOfExpr` | 87 | 67 | 94,072 (3798) | 1,235,759 (8944) |
| `globalReadStructIndex` | 12 | 1 | 53,357 (2854) | 599,499 (6913) |
| `capturedStructIndex` | 5 | 1 | 52,161 (2680) | 539,190 (6126) |
| `callStoreListKind` | 5 | 2 | 47,505 (1628) | 116,833 (2413) |
| `retCapturedMapShape` | 25 | 2 | 39,284 (5388) | 2,703 (888) |
| `arrLitIsRefTpl` | 48 | 3 | 34,916 (6638) | 82,990 (6884) |
| `arrLitNumKind` | 38 | 5 | 29,474 (5270) | 72,287 (6873) |
| `unionIdentReadKind` | 25 | 2 | 26,320 (3869) | 592,008 (8248) |
| `exprIsLitAtom` | 96 | 91 | 24,026 (4061) | 1,360,976 (12933) |
| `arrLitIsF32` | 16 | 3 | 22,359 (4838) | 59,344 (6869) |
| `unionNameOfRead` | 67 | 20 | 18,340 (2253) | 1,123,394 (9225) |
| `vkNulKindOf` | 10 | 2 | 13,193 (2057) | 1,326,341 (12772) |
| `cloArrCallRetKind` | 20 | 2 | 12,376 (1815) | 147,538 (6826) |
| `captureValKind` | 76 | 9 | 12,264 (393) | 55,584 (1119) |
| `readKindIsNul` | 17 | 3 | 11,843 (2448) | 615,960 (11837) |
| `nulVariantIdxOfExpr` | 95 | 24 | 11,299 (1338) | 842,383 (12757) |
| `calleeRetKindOfRead` | 3 | 4 | 10,325 (1415) | 162,108 (7261) |
| `mapReadMvSlot` | 52 | 14 | 10,222 (800) | 408,689 (9436) |
| `identStoreClaimed` | 7 | 2 | 9,387 (1890) | 1,474,855 (7619) |
| `letIsNulNone` | 15 | 4 | 9,385 (2393) | 412,776 (12057) |
| `exprUnionCall` | 48 | 2 | 8,423 (1713) | 100,966 (5579) |
| `exprIsStrConcat` | 18 | 7 | 7,640 (1636) | 614,799 (9162) |
| `exprIsNulNone` | 43 | 16 | 6,961 (1424) | 849,175 (12972) |
| `exprNulLitUnion` | 102 | 16 | 6,943 (1663) | 1,285,032 (11100) |
| `arrLitObjElemBoxVariant` | 17 | 5 | 6,500 (1389) | 7,914 (1391) |
| `listFitArmTestIn` | 22 | 2 | 5,003 (8) | 568,348 (182) |
| `arrLitInstElemRow` | 24 | 2 | 4,871 (2913) | 8,643 (3301) |
| `arrLitElemNameTpl` | 101 | 1 | 4,841 (2909) | 6,918 (3271) |
| `letCellKindGo` | 13 | 2 | 4,615 (2204) | 206,653 (12055) |
| `memberUnionFieldName` | 83 | 1 | 4,414 (1127) | 182,207 (8207) |
| `armFieldUnionName` | 64 | 1 | 4,363 (1116) | 163,551 (8103) |
| `exprIsClosureNoLocal` | 43 | 3 | 4,045 (265) | 26,414 (1408) |
| `blockTailIsClosure` | 16 | 1 | 4,045 (266) | 27,494 (1505) |
| `exprIsStrMethod` | 11 | 8 | 4,013 (1126) | 1,202,153 (12733) |
| `globalCellKindGo` | 9 | 1 | 2,989 (1298) | 40,341 (9341) |
| `letInitIsNulLitBox` | 8 | 2 | 2,931 (1209) | 143,847 (9669) |
| `scalarKindWidth` | 7 | 1 | 2,811 (301) | 183,552 (6005) |
| `cloRetValKind` | 27 | 15 | 2,732 (285) | 315,931 (4200) |
| `columnListRepOfRead` | 14 | 1 | 2,714 (266) | 751 (40) |
| `letIsRefArray` | 25 | 3 | 2,248 (566) | 407 (125) |
| `fnRetStructIndexSid` | 11 | 1 | 2,035 (509) | 29,443 (1567) |
| `calleeReturnsStructIdxOfRead` | 6 | 1 | 1,823 (459) | 16,704 (1308) |
| `letIsStruct` | 22 | 3 | 1,708 (441) | 288 (85) |
| `fnSigKeyOf` | 30 | 4 | 1,699 (159) | 139,917 (4040) |
| `cloRetKindOf` | 24 | 2 | 1,699 (159) | 141,239 (4047) |
| `memberIsClosure` | 18 | 3 | 1,624 (620) | 42,149 (3631) |
| `forInElemKind` | 81 | 10 | 1,509 (25) | 58,286 (1825) |
| `exprNulStrArray` | 35 | 7 | 1,504 (25) | 207,818 (6284) |
| `identIsBoundClosure` | 35 | 6 | 1,495 (483) | 137,123 (8719) |
| `popRefRecvSlot` | 23 | 4 | 1,260 (474) | 12,175 (1417) |
| `letIsMap` | 25 | 3 | 1,238 (288) | 24,411 (807) |
| `letIsUnion` | 25 | 7 | 1,120 (221) | 1,042 (144) |
| `letInitCellKind` | 42 | 3 | 1,111 (222) | 348 (109) |
| `letIsF64Array` | 24 | 1 | 1,101 (221) | 324 (98) |
| `letInfStrListByUseV` | 41 | 1 | 1,093 (218) | 319 (96) |
| `refListElemNameOfExprRaw` | 82 | 1 | 1,020 (272) | 16,242 (550) |
| `refListElemKind` | 3 | 6 | 839 (124) | 46,081 (4588) |
| `bindingIsNulLitUnion` | 18 | 4 | 783 (189) | 420,790 (5053) |
| `captureValStructIdx` | 53 | 6 | 640 (54) | 6,266 (1119) |
| `cloValueCallRetKind` | 15 | 2 | 490 (83) | 25,351 (3059) |
| `capturedRefListSlot` | 5 | 2 | 421 (87) | 4,266 (449) |
| `cloRetKeySuffix` | 35 | 2 | 395 (46) | 45,177 (2892) |
| `cloRetValSlot` | 54 | 12 | 347 (138) | 48,676 (3756) |
| `bindingIsLitAtom` | 19 | 4 | 314 (109) | 308,988 (1509) |
| `readNulVKind` | 6 | 1 | 277 (60) | 17,083 (1904) |
| `mfResultSlotOf` | 13 | 3 | 262 (128) | 3,549 (715) |
| `mfStructResultRowName` | 27 | 1 | 260 (128) | 15 (5) |
| `arrNewNamedKind` | 37 | 2 | 256 (215) | 349 (61) |
| `cloRetIsStructRow` | 4 | 2 | 251 (125) | 2,152 (669) |
| `armIsNulNone` | 4 | 2 | 248 (89) | 4,520 (680) |
| `idxRecvIsStrList` | 18 | 3 | 234 (37) | 80,991 (1144) |
| `callResultIsLitAtom` | 41 | 1 | 204 (93) | 28,202 (839) |
| `letInitNarrowedAtomKind` | 14 | 1 | 194 (53) | 3,790 (692) |
| `cloArrElemSelfKey` | 22 | 1 | 171 (25) | 3,018 (269) |
| `identBindingNulStrList` | 23 | 2 | 158 (8) | 95,761 (4946) |
| `readLoopElemKind` | 7 | 2 | 136 (8) | 52 (31) |
| `callIsMapFilter` | 16 | 2 | 126 (24) | 825 (220) |
| `ifExprRefKindOf` | 82 | 1 | 122 (61) | 1,163 (382) |
| `compositionMapReadSlot` | 23 | 1 | 121 (6) | 7,111 (1294) |
| `letDeclIsClosureNoLocal` | 21 | 3 | 106 (7) | 9,048 (740) |
| `letIsNulString` | 23 | 2 | 105 (83) | 131,784 (8788) |
| `refListElemIsRow` | 4 | 3 | 70 (16) | 723 (216) |
| `cloPinnedListElemKey` | 21 | 1 | 59 (17) | 342 (81) |
| `forInPairElemKind` | 4 | 3 | 54 (2) | 7,191 (1832) |
| `letTailRowSlot` | 13 | 1 | 51 (12) | 2,824 (301) |
| `mapValElemKind` | 53 | 2 | 47 (1) | 611 (92) |
| `forInMapWalksVals` | 15 | 2 | 37 (3) | 3,710 (908) |
| `letRefListElemName` | 16 | 3 | 25 (10) | 90 (13) |
| `readCellKind` | 13 | 3 | 24 (6) | 381,909 (11986) |
| `arrLitObjRowTy` | 15 | 1 | 21 (6) | 1,244 (77) |
| `forInVarIsLitAtom` | 12 | 1 | 18 (12) | 5,363 (794) |
| `loopVarReadIsAtom` | 21 | 1 | 2 (1) | 14 (11) |
| `moduleCopySigKey` | 16 | 1 | 2 (1) | 4 (2) |

## The storage column (not deletion targets)

| classifier | lines | call sites | calls before monomorphize (files) | calls after (files) |
| --- | --- | --- | --- | --- |
| `identCellVKind` | 15 | 9 | 33,652 (3607) | 4,076,225 (12944) |
| `identStoreVKind` | 7 | 2 | 20,170 (3299) | 596,737 (11877) |
| `readListKindOf` | 8 | 5 | 11,585 (2442) | 2,444,081 (11859) |
| `letCellKind` | 28 | 5 | 7,672 (2204) | 313,462 (12049) |
| `globalCellKind` | 26 | 17 | 6,648 (1298) | 567,200 (9319) |
| `readIndexStoreKind` | 41 | 1 | 963 (202) | 55,186 (3721) |
| `letCellSlot` | 13 | 3 | 0 (0) | 186,888 (11483) |
| `readCallStoreKind` | 9 | 1 | 0 (0) | 74 (15) |

## After return-kind inference reads the recorded result (2026-11-02)

`exprListRep`'s asks before monomorphize, by pass: `computeRetInference` 228,242 (97.9%),
`monomorphize` 2,123, `collectA` 1,635, `dispatchRewrite` 921. Once `criClassify` answers a
closed recorded result first, the asks before monomorphize fall as follows, with no output
change. No mixed classifier becomes post-monomorphize-only yet.

| classifier | calls before monomorphize, then | now |
| --- | --- | --- |
| `exprListRep` | 233,073 | 84,760 |
| `listOfColumn` | 232,981 | 83,140 |
| `callStoreListKind` | 47,505 | 8,621 |
| `capturedKindOf` | 137,574 | 129,306 |
| `unionIdentReadKind` | 26,320 | 22,274 |
| `vkNulKindOf` | 13,193 | 9,176 |
| `unionNameOfRead` | 18,340 | 14,616 |
