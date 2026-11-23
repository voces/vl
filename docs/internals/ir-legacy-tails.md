# Legacy tails the IR calls

Derived from the tree at master `111d9d823` (fold of 2026-11-23, thirteenth; coordinator ruling 2026-11-23:
the fold derives this list, lanes never edit it). It is what the IR still borrows from legacy, so it is the
work list for the cutover (I8): each writer here is either moved into the IR or kept as a shared emitter
helper, by name.

**How it is derived.** Every name a `compiler/ir_*.vl` file imports from `compiler/wasmEmit.vl` or a
`compiler/emit_*.vl` module (1081 names). A function is a **writer** when some call path from it reaches a
body byte writer (an `fb*` function of `emit_bytes.vl` that appends bytes), and an IR lowering file
(`ir_lower.vl`, `ir_lower_ref.vl`) imports it. Every other imported function is a **predicate or plan**: it
answers a question or returns a plan and writes no function-body byte. The call graph is read from the
source with comments removed and names defined in more than one module left out, so a writer reached only
through such a name is listed as a predicate. Re-derive at each fold; do not hand-edit a row.

## State the lowering reads

Shared emitter state, read at the same emission point legacy reads it (coordinator ruling 2026-11-23: the
lowering may read it, the IR build may not; the IR takes ownership at I8).

- `liKinds` (`wasmEmit.vl`): `liKinds.length`, the sequence number of a push's unrecorded run literal, read
  in `ir_lower.vl` `spreadList` (IR-N3 batch 3, #9694).
- `fitRecvReadHook` (`wasmEmit.vl`): the receiver re-read legacy's fit writers call; `ir_lower.vl` swaps in
  `irFitRecvRead` around the writer and restores it (#9672, #9674).

## Writers the lowering calls (309)

One line each: name, defining module, importing files.

- `arrCopyBacking` (`wasmEmit.vl`): ir_lower.vl
- `arrCopyTail` (`wasmEmit.vl`): ir_lower.vl
- `arrLenTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `arrLitDataTry` (`wasmEmit.vl`): ir_lower.vl
- `arrLitHoistGlobal` (`wasmEmit.vl`): ir_lower.vl
- `arrLitPackedShortTail` (`wasmEmit.vl`): ir_lower.vl
- `arrLitRefShortTail` (`wasmEmit.vl`): ir_lower.vl
- `arrLitShortTail` (`wasmEmit.vl`): ir_lower.vl
- `arrLitStrChunkClose` (`wasmEmit.vl`): ir_lower.vl
- `arrLitStrChunkOpen` (`wasmEmit.vl`): ir_lower.vl
- `arrLitStrChunkStep` (`wasmEmit.vl`): ir_lower.vl
- `arrNewDefaultTail` (`wasmEmit.vl`): ir_lower.vl
- `arrNewLenStash` (`wasmEmit.vl`): ir_lower.vl
- `arrNewTail` (`wasmEmit.vl`): ir_lower.vl
- `arrSliceTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `asLitTail` (`wasmEmit.vl`): ir_lower.vl
- `atomEqIsTail` (`wasmEmit.vl`): ir_lower.vl
- `atomEqTail` (`wasmEmit.vl`): ir_lower.vl
- `atomFoldSideTail` (`wasmEmit.vl`): ir_lower.vl
- `atomFoldTail` (`wasmEmit.vl`): ir_lower.vl
- `atomNotNulIsTail` (`wasmEmit.vl`): ir_lower.vl
- `atomStrTail` (`wasmEmit.vl`): ir_lower.vl
- `boxTagIsTail` (`wasmEmit.vl`): ir_lower.vl
- `callRefCallTail` (`wasmEmit.vl`): ir_lower.vl
- `callRefEnvOpen` (`wasmEmit.vl`): ir_lower.vl
- `callRefStash` (`wasmEmit.vl`): ir_lower.vl
- `clearLenTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `closureEqTail` (`wasmEmit.vl`): ir_lower.vl
- `coalArmRecvCast` (`wasmEmit.vl`): ir_lower.vl
- `coalAtomStrClose` (`wasmEmit.vl`): ir_lower.vl
- `coalAtomStrOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalBoxElse` (`wasmEmit.vl`): ir_lower.vl
- `coalBoxEnd` (`wasmEmit.vl`): ir_lower.vl
- `coalBoxFieldScalarOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalBoxOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalBoxStashOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalFieldBoxOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalFieldRead` (`wasmEmit.vl`): ir_lower.vl
- `coalFieldUnbox` (`wasmEmit.vl`): ir_lower.vl
- `coalFieldValOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalNicheElse` (`wasmEmit.vl`): ir_lower.vl
- `coalNicheOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalNulBoolJoinOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalNulBoolJoinPresent` (`wasmEmit.vl`): ir_lower.vl
- `coalNulRefBranch` (`wasmEmit.vl`): ir_lower.vl
- `coalNulRefJoinOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalNulRefJoinPresent` (`wasmEmit.vl`): ir_lower.vl
- `coalNulRefOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalOptLeafOpen` (`wasmEmit.vl`): ir_lower.vl
- `coalOptLeafRead` (`wasmEmit.vl`): ir_lower.vl
- `coerceTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `discrimFieldEqTail` (`wasmEmit.vl`): ir_lower.vl
- `emitArmUnboxAt` (`wasmEmit.vl`): ir_lower.vl
- `emitArrLenHeld` (`wasmEmit.vl`): ir_lower_ref.vl
- `emitAsUnionTagged` (`wasmEmit.vl`): ir_lower.vl
- `emitCapturedRead` (`wasmEmit.vl`): ir_lower.vl
- `emitCloCellRef` (`wasmEmit.vl`): ir_lower.vl
- `emitClosureIds` (`wasmEmit.vl`): ir_lower.vl
- `emitClosureValue` (`wasmEmit.vl`): ir_lower_ref.vl
- `emitClosureValueCore` (`wasmEmit.vl`): ir_lower.vl
- `emitEnvCacheClose` (`wasmEmit.vl`): ir_lower.vl
- `emitEnvCacheDrop` (`wasmEmit.vl`): ir_lower.vl
- `emitEnvCacheOpen` (`wasmEmit.vl`): ir_lower.vl
- `emitEqNonNullCore` (`wasmEmit.vl`): ir_lower_ref.vl
- `emitForInCursorInit` (`wasmEmit.vl`): ir_lower.vl
- `emitListEmptyLoop` (`wasmEmit.vl`): ir_lower.vl
- `emitMapGetScalarBoxTail` (`wasmEmit.vl`): ir_lower.vl
- `emitMapGetTail` (`wasmEmit.vl`): ir_lower.vl
- `emitMapNew` (`wasmEmit.vl`): ir_lower.vl
- `emitNarrowedMapReadTail` (`wasmEmit.vl`): ir_lower.vl
- `emitNicheReadTail` (`wasmEmit.vl`): ir_lower.vl
- `emitNullOwn` (`wasmEmit.vl`): ir_lower.vl
- `emitNullRetTail` (`wasmEmit.vl`): ir_lower.vl
- `emitOmittedFieldNull` (`wasmEmit.vl`): ir_lower.vl
- `emitOptLeafHead` (`wasmEmit.vl`): ir_lower.vl
- `emitOptLeafTail` (`wasmEmit.vl`): ir_lower.vl
- `emitOptLinkNullClose` (`wasmEmit.vl`): ir_lower.vl
- `emitOptLinkNullOpen` (`wasmEmit.vl`): ir_lower.vl
- `emitRangeRolledHead` (`wasmEmit.vl`): ir_lower.vl
- `emitRangeRolledTail` (`wasmEmit.vl`): ir_lower.vl
- `emitRecordFitIs` (`wasmEmit.vl`): ir_lower.vl
- `emitStrLitAt` (`wasmEmit.vl`): ir_lower.vl
- `emitUnionNullToPair` (`wasmEmit.vl`): ir_lower.vl
- `emitUnionUnboxTail` (`wasmEmit.vl`): ir_lower.vl
- `emptyFitArmBody` (`wasmEmit.vl`): ir_lower.vl
- `emptyFitArmHead` (`wasmEmit.vl`): ir_lower.vl
- `f64RemCallTail` (`wasmEmit.vl`): ir_lower.vl
- `f64RemOperandTail` (`wasmEmit.vl`): ir_lower.vl
- `fbRefIfOpenType` (`wasmEmit.vl`): ir_lower.vl
- `fcpBackingTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `fcpLenTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `fcpSpillTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `fieldStoreTail` (`wasmEmit.vl`): ir_lower.vl
- `fieldStoreVariantTail` (`wasmEmit.vl`): ir_lower.vl
- `forInBreakOpen` (`wasmEmit.vl`): ir_lower.vl
- `forInCopiesHead` (`wasmEmit.vl`): ir_lower.vl
- `forInCopiesTail` (`wasmEmit.vl`): ir_lower.vl
- `forInCopyClose` (`wasmEmit.vl`): ir_lower.vl
- `forInCopyOpen` (`wasmEmit.vl`): ir_lower.vl
- `forInHeaderHoist` (`wasmEmit.vl`): ir_lower.vl
- `forInListStore` (`wasmEmit.vl`): ir_lower.vl
- `forInListSync` (`wasmEmit.vl`): ir_lower.vl
- `forInLoopClose` (`wasmEmit.vl`): ir_lower.vl
- `forInMapList` (`wasmEmit.vl`): ir_lower.vl
- `forInMapStash` (`wasmEmit.vl`): ir_lower.vl
- `forInPairInit` (`wasmEmit.vl`): ir_lower.vl
- `forInRolledOpen` (`wasmEmit.vl`): ir_lower.vl
- `fromCpTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `hoistReadTail` (`wasmEmit.vl`): ir_lower.vl
- `holeBoxHead` (`wasmEmit.vl`): ir_lower.vl
- `holeBoxTail` (`wasmEmit.vl`): ir_lower.vl
- `hostCallTail` (`wasmEmit.vl`): ir_lower.vl
- `idxStoreTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `listBuildClose` (`wasmEmit.vl`): ir_lower.vl
- `listCatOperandTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `listCatTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `listEqOperandTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `listEqTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `listFitTail` (`wasmEmit.vl`): ir_lower.vl
- `listIsAcrossTail` (`wasmEmit.vl`): ir_lower.vl
- `listReserveOpen` (`wasmEmit.vl`): ir_lower.vl
- `mapDeleteTail` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrI32Head` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrI32Tail` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrMvHead` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrMvTail` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrNicheHead` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrNicheTail` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrSentinelHead` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrSentinelTail` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrUnionBoxOpen` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrUnionBoxTail` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrUnionHead` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrUnionScalarOpen` (`wasmEmit.vl`): ir_lower.vl
- `mapGetOrUnionScalarTail` (`wasmEmit.vl`): ir_lower.vl
- `mapGetUnionBoxTail` (`wasmEmit.vl`): ir_lower.vl
- `mapHasTail` (`wasmEmit.vl`): ir_lower.vl
- `mapListStep` (`wasmEmit.vl`): ir_lower.vl
- `mapPrepProbeTail` (`wasmEmit.vl`): ir_lower.vl
- `mapRecvRefTail` (`wasmEmit.vl`): ir_lower.vl
- `mapSetTail` (`wasmEmit.vl`): ir_lower.vl
- `mapSizeTail` (`wasmEmit.vl`): ir_lower.vl
- `mapUnionUnboxTail` (`wasmEmit.vl`): ir_lower.vl
- `memberOrTail` (`wasmEmit.vl`): ir_lower.vl
- `memOpTail` (`wasmEmit.vl`): ir_lower.vl
- `mfLoopTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `mfRecvTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `narrowedMemTail` (`wasmEmit.vl`): ir_lower.vl
- `narrowedVariantTail` (`wasmEmit.vl`): ir_lower.vl
- `nicheRawIsTail` (`wasmEmit.vl`): ir_lower.vl
- `nulNicheEqHead` (`wasmEmit.vl`): ir_lower.vl
- `nulNicheEqLeftTail` (`wasmEmit.vl`): ir_lower.vl
- `nulNicheEqNullTail` (`wasmEmit.vl`): ir_lower.vl
- `nulNicheEqRightTail` (`wasmEmit.vl`): ir_lower.vl
- `nulNoneBoxHead` (`wasmEmit.vl`): ir_lower.vl
- `nulNoneBoxTail` (`wasmEmit.vl`): ir_lower.vl
- `nulStrMemberClose` (`wasmEmit.vl`): ir_lower.vl
- `nulStrMemberGuard` (`wasmEmit.vl`): ir_lower.vl
- `nulStrMemberOpen` (`wasmEmit.vl`): ir_lower.vl
- `nulTestAtomTail` (`wasmEmit.vl`): ir_lower.vl
- `nulTestBoolTail` (`wasmEmit.vl`): ir_lower.vl
- `nulTestBoxTagTail` (`wasmEmit.vl`): ir_lower.vl
- `nulTestRefTail` (`wasmEmit.vl`): ir_lower.vl
- `numCastTail` (`wasmEmit.vl`): ir_lower.vl
- `numIntrTail` (`wasmEmit.vl`): ir_lower.vl
- `numLitEqTail` (`wasmEmit.vl`): ir_lower.vl
- `numLitOnceMember` (`wasmEmit.vl`): ir_lower.vl
- `numLitOnceStash` (`wasmEmit.vl`): ir_lower.vl
- `numUnionBinTail` (`wasmEmit.vl`): ir_lower.vl
- `numUnionConvertTail` (`wasmEmit.vl`): ir_lower.vl
- `numUnionStashTail` (`wasmEmit.vl`): ir_lower.vl
- `numWidenTail` (`wasmEmit.vl`): ir_lower.vl
- `objStructNewTail` (`wasmEmit.vl`): ir_lower.vl
- `popOrOpen` (`wasmEmit.vl`): ir_lower.vl
- `popRefTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `popScalarTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `printAtomTail` (`wasmEmit.vl`): ir_lower.vl
- `printNulBoolOpen` (`wasmEmit.vl`): ir_lower.vl
- `printNulBoolTail` (`wasmEmit.vl`): ir_lower.vl
- `printNulStrOpen` (`wasmEmit.vl`): ir_lower.vl
- `printNulStrTail` (`wasmEmit.vl`): ir_lower.vl
- `printScalarTail` (`wasmEmit.vl`): ir_lower.vl
- `printStrTail` (`wasmEmit.vl`): ir_lower.vl
- `printUnionTail` (`wasmEmit.vl`): ir_lower.vl
- `pushAppendTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `pushManyRecvTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `pushManyTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `pushValueTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `rangePartialCopyClose` (`wasmEmit.vl`): ir_lower.vl
- `rangePartialCopyOpen` (`wasmEmit.vl`): ir_lower.vl
- `rangePartialMainClose` (`wasmEmit.vl`): ir_lower.vl
- `rangePartialMainOpen` (`wasmEmit.vl`): ir_lower.vl
- `rangePartialOuterClose` (`wasmEmit.vl`): ir_lower.vl
- `rangePartialOuterOpen` (`wasmEmit.vl`): ir_lower.vl
- `rawStrGetTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `recCopyPureEmit` (`wasmEmit.vl`): ir_lower.vl
- `refArrayUnionUnboxTail` (`wasmEmit.vl`): ir_lower.vl
- `refListGetTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `scalarListGetTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `scalarMapEqReadTail` (`wasmEmit.vl`): ir_lower.vl
- `scalarMapEqTail` (`wasmEmit.vl`): ir_lower.vl
- `sharedArmHead` (`wasmEmit.vl`): ir_lower.vl
- `sharedArmTail` (`wasmEmit.vl`): ir_lower.vl
- `sharedArmTestTail` (`wasmEmit.vl`): ir_lower.vl
- `sharedReadTail` (`wasmEmit.vl`): ir_lower.vl
- `sharedRecvSlotGet` (`wasmEmit.vl`): ir_lower.vl
- `sliceRecvTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `spreadGroupStash` (`wasmEmit.vl`): ir_lower.vl
- `spreadJoinGroups` (`wasmEmit.vl`): ir_lower.vl
- `stageListRecvTail` (`wasmEmit.vl`): ir_lower.vl, ir_lower_ref.vl
- `staticAtomId` (`wasmEmit.vl`): ir_lower.vl
- `strAccAppendTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strCatTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strCpAtTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strCpLenTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strEqLitHead` (`wasmEmit.vl`): ir_lower_ref.vl
- `strEqLitTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strEqNegTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strFromBytesTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strIndexOfTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strListGetTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strMemberEqTail` (`wasmEmit.vl`): ir_lower.vl
- `strOrderTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strSiteCatTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strSliceTail` (`wasmEmit.vl`): ir_lower_ref.vl
- `strToAtomIdTail` (`wasmEmit.vl`): ir_lower.vl
- `strToAtomSoleTail` (`wasmEmit.vl`): ir_lower.vl
- `strToAtomStagedTail` (`wasmEmit.vl`): ir_lower.vl
- `strToAtomTestTail` (`wasmEmit.vl`): ir_lower.vl
- `strToAtomWideTail` (`wasmEmit.vl`): ir_lower.vl
- `structEqRoots` (`wasmEmit.vl`): ir_lower.vl
- `structEqTail` (`wasmEmit.vl`): ir_lower.vl
- `structFieldTail` (`wasmEmit.vl`): ir_lower.vl
- `structUnionBoxTail` (`wasmEmit.vl`): ir_lower.vl
- `tagDispatchIfOf` (`wasmEmit.vl`): ir_lower.vl
- `tagIsTail` (`wasmEmit.vl`): ir_lower.vl
- `tagStashTail` (`wasmEmit.vl`): ir_lower.vl
- `uBoxNewIsLast` (`wasmEmit.vl`): ir_lower.vl
- `uBoxSinkToPair` (`wasmEmit.vl`): ir_lower.vl
- `unionBoxToPairTail` (`wasmEmit.vl`): ir_lower.vl
- `unionEqCmpTail` (`wasmEmit.vl`): ir_lower.vl
- `unionEqPayloadTail` (`wasmEmit.vl`): ir_lower.vl
- `unionEqStashTail` (`wasmEmit.vl`): ir_lower.vl
- `unionEqTagTail` (`wasmEmit.vl`): ir_lower.vl
- `unionLetSinkClose` (`wasmEmit.vl`): ir_lower.vl
- `unionLitNeverTail` (`wasmEmit.vl`): ir_lower.vl
- `unionLitPayloadTail` (`wasmEmit.vl`): ir_lower.vl
- `unionLitTagHead` (`wasmEmit.vl`): ir_lower.vl
- `unionUnionBoxesTail` (`wasmEmit.vl`): ir_lower.vl
- `urLocalRead` (`wasmEmit.vl`): ir_lower.vl
- `variantFieldTail` (`wasmEmit.vl`): ir_lower.vl
- `variantRowChainTail` (`wasmEmit.vl`): ir_lower.vl
- `variantStructNewTail` (`wasmEmit.vl`): ir_lower.vl
- `variantTagTail` (`wasmEmit.vl`): ir_lower.vl
- `variantUnionBoxTail` (`wasmEmit.vl`): ir_lower.vl
- `fbArrayCopy` (`emit_bytes.vl`): ir_lower.vl
- `fbArrayFill` (`emit_bytes.vl`): ir_lower.vl
- `fbArrayGet` (`emit_bytes.vl`): ir_lower.vl
- `fbArrayInitData` (`emit_bytes.vl`): ir_lower.vl
- `fbArrayLen` (`emit_bytes.vl`): ir_lower.vl
- `fbArrayNewDefault` (`emit_bytes.vl`): ir_lower.vl
- `fbArraySet` (`emit_bytes.vl`): ir_lower.vl
- `fbBlock` (`emit_bytes.vl`): ir_lower.vl
- `fbBr` (`emit_bytes.vl`): ir_lower.vl
- `fbBrIf` (`emit_bytes.vl`): ir_lower.vl
- `fbBrTable` (`emit_bytes.vl`): ir_lower.vl
- `fbCall` (`emit_bytes.vl`): ir_lower.vl
- `fbDrop` (`emit_bytes.vl`): ir_lower.vl, ir_lower_ref.vl
- `fbElse` (`emit_bytes.vl`): ir_lower.vl
- `fbEmitLocalsVec` (`emit_bytes.vl`): ir_lower.vl
- `fbEnd` (`emit_bytes.vl`): ir_lower.vl
- `fbF32ConstBits` (`emit_bytes.vl`): ir_lower.vl
- `fbF64ConstBits` (`emit_bytes.vl`): ir_lower.vl
- `fbGlobalGet` (`emit_bytes.vl`): ir_lower.vl
- `fbGlobalSet` (`emit_bytes.vl`): ir_lower.vl
- `fbI32Bin` (`emit_bytes.vl`): ir_lower.vl
- `fbI32Const` (`emit_bytes.vl`): ir_lower.vl
- `fbI32Eqz` (`emit_bytes.vl`): ir_lower.vl
- `fbI32Load` (`emit_bytes.vl`): ir_lower.vl
- `fbI32RelOf` (`emit_bytes.vl`): ir_lower.vl
- `fbI32WrapI64` (`emit_bytes.vl`): ir_lower.vl
- `fbI64Const` (`emit_bytes.vl`): ir_lower.vl
- `fbIf` (`emit_bytes.vl`): ir_lower.vl
- `fbIfRefNul` (`emit_bytes.vl`): ir_lower.vl
- `fbLocalGet` (`emit_bytes.vl`): ir_lower.vl
- `fbLocalRun` (`emit_bytes.vl`): ir_lower.vl
- `fbLocalSet` (`emit_bytes.vl`): ir_lower.vl
- `fbLocalTee` (`emit_bytes.vl`): ir_lower.vl
- `fbLoop` (`emit_bytes.vl`): ir_lower.vl
- `fbMapTagOfI64` (`emit_bytes.vl`): ir_lower.vl
- `fbOpenBlock` (`emit_bytes.vl`): ir_lower.vl
- `fbOpenIf` (`emit_bytes.vl`): ir_lower.vl
- `fbRefAsNonNull` (`emit_bytes.vl`): ir_lower.vl, ir_lower_ref.vl
- `fbRefCast` (`emit_bytes.vl`): ir_lower.vl
- `fbRefEq` (`emit_bytes.vl`): ir_lower.vl
- `fbRefIsNull` (`emit_bytes.vl`): ir_lower.vl
- `fbRefNull` (`emit_bytes.vl`): ir_lower.vl
- `fbRefNullNone` (`emit_bytes.vl`): ir_lower.vl
- `fbRefNullOfKind` (`emit_bytes.vl`): ir_lower.vl
- `fbRefNullStruct` (`emit_bytes.vl`): ir_lower.vl
- `fbRefTest` (`emit_bytes.vl`): ir_lower.vl
- `fbReturnCall` (`emit_bytes.vl`): ir_lower.vl
- `fbReturnOp` (`emit_bytes.vl`): ir_lower.vl
- `fbSelect` (`emit_bytes.vl`): ir_lower.vl
- `fbStructGet` (`emit_bytes.vl`): ir_lower.vl
- `fbStructNew` (`emit_bytes.vl`): ir_lower.vl
- `fbStructSet` (`emit_bytes.vl`): ir_lower.vl
- `fbUnreachable` (`emit_bytes.vl`): ir_lower.vl
- `fbValtype` (`emit_bytes.vl`): ir_build.vl, ir_lower.vl, ir_verify_facts.vl

Reached through a listed writer rather than imported, and named by a lane:

- `asLitAtomTail`, `asNumLitScalarTail` (through `asLitTail`, #9679); `numExactCastTail` (through
  `numCastTail`, #9679); `emitBoxAtomRetagTys` (through `structUnionBoxTail`).

## Predicates and plans (647)

- `wasmEmit.vl`: `armIndexWriteArmsOf`, `arrCopyCallNamed`, `arrCopyPlanOf`, `arrLenHoistOf`,
  `arrLitIsForIter`, `arrLitLongRouteOf`, `arrLitPrologue`, `arrLitShortWhy`, `arrNewCallNamed`,
  `arrNewFillBoxTy`, `arrNewFillStep`, `arrNewPlanOf`, `arrNewWhyOf`, `arrSlicePlanOf`, `asCastArmOf`,
  `asgValueArmOf`, `asLitAtomWhy`, `asNicheCastWhy`, `asNumLitScalarWhy`, `asUnionTagWhy`, `asWrapArmOf`,
  `atomHookArmOf`, `atomicCallNamed`, `atomicPlanOf`, `atomicResultPrim`, `atomicTail`, `atomicValPrim`,
  `atomStrPlanOf`, `binNumWidth`, `blockValueWidenKind`, `bundleArgArmOf`, `bundleCallRefPlainKey`,
  `bundleChoiceTyOf`, `bundleHandMemberAt`, `bundleMemberPickOf`, `bundlePickOf`, `bundleResultPickOf`,
  `callEndsNever`, `callRefArgArmOf`, `callRefArmUnboxPlan`, `callRefBundleArgOf`, `callRefLegacyPlainKey`,
  `callRefPlainKey`, `callRefPlainVoid`, `callStmtDispatches`, `callStmtIdentDrops`, `capturedArgArmOf`,
  `clearPlanOf`, `clearRecvIsList`, `cloCellReaches`, `cloLiftCalleeOf`, `closureValueCoreWhy`,
  `closureValueWhy`, `coalAtomStrReserve`, `coalBoxFieldScalarPlanOf`, `coalBoxSlot`, `coalChainLinkOf`,
  `coalClosedWidensAtom`, `coalDeadJoinIfOf`, `coalFieldPlanOf`, `coalHoleMapIfOf`, `coalNextArmOf`,
  `coalNulBoolJoinReserve`, `coalNulBoolJoinWhy`, `coalNullTestIf`, `coalNulMapJoinStoresAlike`,
  `coalNulRefJoinTag`, `coalNulRefJoinWhy`, `coalNulRefPlanOf`, `coalNulRefRungReached`, `coalNulRefsArmOf`,
  `coalOptArmOf`, `coalOptLeafPlanOf`, `coalOptPassesToNulRefs`, `coerceHeldSwap`, `directArgUnionTyOf`,
  `directCallInstanceArgMisfit`, `dispatchDeclinesTail`, `elseLessUnionIfWhy`, `emitFoldedConstRead`,
  `emptyFitArmsPlain`, `emptyFitArmsPlanOf`, `emptyFitPlanOf`, `envCacheSlotOfFe`, `eqOperandDecodes`,
  `eqRouteOf`, `exprPrePathPastCoerce`, `exprPrePathWhy`, `fieldNullOwnOf`, `fieldStoreArmOf`,
  `fieldStoreNarrowedAt`, `fieldStoreStructAt`, `fieldStoreValueArmOf`, `fieldStoreVariantAt`,
  `fieldTypedNullHas`, `fitRecvLegacy`, `fnCloFeOf`, `fnFallThroughPadOf`, `fnTagLeafEmitted`,
  `fnValueArmOf`, `fnValueFeOf`, `forInCopiesOf`, `forInCopyCount`, `forInPlainWhy`, `forRangeArm`,
  `forRangeRolledBlock`, `forRangeStaticStep`, `forRangeTestOf`, `forRangeUnrollPlan`, `globalCtxNow`,
  `globalInitArmUnboxes`, `globalReadRecovers`, `guardEndsBlockWith`, `hoistCandRow`, `hoistRowMark`,
  `hoistRowReads`, `holderCallRefPlainKey`, `holderCallSigs`, `holderPickOf`, `holeBoxLeads`, `holeBoxTyAt`,
  `hostCallNamed`, `hostCallPlanOf`, `identListOverrideOf`, `idxArmOf`, `idxCellReadIsNull`, `idxRowsOn`,
  `idxSpanOn`, `idxStoreHoistOf`, `idxStorePlainWhy`, `ifExprJoinVt`, `ifExprPlainWhy`, `ifExprShapeWhy`,
  `ifExprSwitchMay`, `ifJoinAdaptsScalar`, `ifLinkExhausts`, `ifNoElseNicheOf`, `ifThenIsDead`,
  `ifWritesElse`, `initBitOf`, `intSwitchMayLower`, `intSwitchPlanOf`, `irEnvCached`, `isArmRank`,
  `isArmTagOf`, `isDecidedFalse`, `keptDeclStoresNothing`, `legacyContextLiveWhy`, `letIfInitPerArmRep`,
  `letIfInitSinks`, `listCatRouteOf`, `listElemStaysNullable`, `listEqRouteOf`, `listFitIsPlanOf`,
  `listIsAcrossPlanOf`, `listOpRecvHeld`, `listOpRecvHeldPlan`, `listOpStageBase`, `listReadProvedNonNull`,
  `litArmsReadsOf`, `litIsBoxLexes`, `litMemberEqArmOf`, `loopHoistCands`, `loopHoistClose`,
  `lowMemFoldsCallee`, `lvTailAssigns`, `mapFilterPlanOf`, `mapFilterWhy`, `mapGetArmOf`,
  `mapGetHelperFnOf`, `mapGetMissOf`, `mapGetOrArmOf`, `mapGetOrHelperRoute`, `mapGetOrMvPlain`,
  `mapGetOrNicheStash`, `mapGetOrSentinel`, `mapGetOrUnionBoxOf`, `mapGetOrUnionScalarPlanOf`,
  `mapKeyArmOf`, `mapKeysFrameOf`, `mapLengthPlain`, `mapNewCall`, `mapRecvIsSet`, `mapRecvKeyTail`,
  `mapRecvShapeOf`, `mapSetAtomVal`, `mapSetNulBoolVal`, `mapSetRefIntoMono`, `mapSetValArmOf`,
  `mapUnboxTailTy`, `mapValsFrameOf`, `mapValuesAreKeys`, `memAccessCallNamed`, `memAccessPlanOf`,
  `memAccessTail`, `memAddrPlanOf`, `memCallArg`, `memOpCallNamed`, `memOpIsVoid`, `memOpPlanOf`,
  `narrowedMapReadOf`, `nullReadDstOwnOf`, `nulNicheBoxTagOf`, `nulNicheEqWhy`, `nulNoneWritesNothing`,
  `numCastKindOf`, `numCastKindTy`, `numIntrCallReached`, `numIntrPlanOf`, `numLitAsApplies`, `numLitLexAt`,
  `numUnionIsUnionSide`, `numUnionSideBoxed`, `numUnionSideKindOf`, `numUnionSideLit`, `numUnionSidePrim`,
  `numUnionStashEnter`, `numUnionStashLeave`, `objLitArmOf`, `objLitLayoutRowAt`, `objLitLayoutRowOf`,
  `objLitStashes`, `objLitStashRowAt`, `objLitStashRowOf`, `objLitVariantLayoutAt`, `objLitVariantLayoutOf`,
  `objLitVariantStashAt`, `objLitVariantStashOf`, `optLeafArmOf`, `optRecvStagedAt`, `plainCoalesceAt`,
  `popAnyPlanOf`, `popOrPlanOf`, `printArmOf`, `promoSlotIn`, `pushManyOpen`, `pushManyRecvOf`,
  `pushManyRunBuild`, `pushManyRunLit`, `pushPlainWhy`, `rangeMayWrap`, `rangePartialCopies`,
  `rangeProofClose`, `rangeProofOpen`, `rawStrHoistOf`, `recCopyReReads`, `recordFitPlanOf`,
  `recvReadsListPayload`, `refIfArmOf`, `refListHoistOf`, `refListReadPlain`, `refListReadUnboxOf`,
  `retRefusedWhy`, `retUnionTyOf`, `scalarListHoistOf`, `scalarListUsed`, `scalarMapEqPlanOf`,
  `sFieldStorageSlot`, `sharedArmModeOf`, `sharedArmModeReads`, `sharedReadPlainOf`, `sharedReadPlanOf`,
  `sharedReadStashes`, `sharedReadTailOf`, `shiftMaskFoldOf`, `simdCallNamed`, `simdCallRow`, `simdMemBase`,
  `simdMemTail`, `simdOperandPrim`, `simdResultPrim`, `simdRowIsMem`, `simdTail`, `spreadRunLit`,
  `srWrappedMask`, `startInitArmOf`, `stmtWritesNothing`, `strAccRowsAre`, `strCatPartsOf`, `strEqFirstOf`,
  `strEqLitForm`, `strEqLitOf`, `strFromBytesCallNamed`, `strInPlaceMode`, `strInPlaceModeAsked`,
  `strListHoistOf`, `strListReadsNonNull`, `strLitTakesAtom`, `strOrderSwaps`, `strSiteArmMint`,
  `strSiteOfRhsAsked`, `strToAtomArmOf`, `strToAtomTexts`, `structEqEnter`, `structEqStagesLeft`,
  `structEqStagesRight`, `structFieldArmOf`, `structFieldBoxTy`, `tagArmLambdaCallee`, `tagDispatchArms`,
  `tagDispatchBoxes`, `tagDispatchIds`, `tagDispatchTy`, `tagDispatchTyIsVoid`, `tailArmStmtIsValue`,
  `tailIfPlainWhy`, `tplStrHoleOf`, `trapCallNamed`, `truncSatCallNamed`, `truncSatPlanOf`, `truncSatTail`,
  `unionBoxArgReadsMapBox`, `unionConcreteEqPlanOf`, `unionEqHead`, `unionEqStashPlanOf`,
  `unionFieldNarrowUnboxOf`, `unionFieldUnboxKindOf`, `unionLitIsPlanOf`, `unionUnionEqArmOf`,
  `urBindConst`, `urDepth`, `urUnbind`, `userFnCallRoutesRef`, `userFnCallTarget`, `userGlobalIdx`,
  `userGlobalReadClass`, `userGlobalWriteClass`, `valueIfLitTrue`, `variantEqRowOf`, `variantFieldArmOf`,
  `variantFieldBoxTy`, `variantFieldStoreValueArmOf`, `variantIsArmOf`, `variantRowArmOf`, `voidTailCallee`,
  `zextLoadOf`.
- `emit_atom_kinds.vl`: `fieldRowStorageKind`, `optChainStagesRecv`, `sFieldFlatRow`, `sFieldTypeAt`,
  `structIndexOfTy`, `variantFieldStorageKind`, `variantFieldTypeAt`.
- `emit_base.vl`: `charLitCp`, `exprEffectFree`, `isTestsNull`, `listIsTestedIdent`, `objFieldSrcOrder`,
  `objFieldVal`, `quoteLex`, `unionEqOperandOk`, `unwrapParen`.
- `emit_bignum.vl`: `f32Bytes`, `f64Bytes`, `numLexIsFloat`, `parseI32`, `parseI64Pair`.
- `emit_bundle.vl`: `bundleAnyNoted`, `bundleParamOfRead`, `bundleSigsOfParam`.
- `emit_bytes.vl`: `emitFail`, `fbLocalIsUnsetRef`, `fbResetLazyFrame`, `htStructHeap`, `mapTypeIdxOf`,
  `wBytes`, `wSLEB`, `wTarget`, `wU8`, `wULEB`.
- `emit_capture_frames.vl`: `captureLoopNodeOf`, `captureLoopVarDeclOf`, `ctxTyAt`, `fnEnvIdxOf`,
  `nodeTyAt`, `numLitTyWidth`, `numLitWidth`, `parentBindingFrameArenaOf`, `parentBindingOf`,
  `readNarrowedTyAt`, `scopeTyAt`.
- `emit_classify.vl`: `asgReadUnwidenOp`, `asgReReadEnter`, `asgReReadLeave`, `boxedFieldUnionTyOf`,
  `callIsArrSlice`, `capCellTargetOf`, `captureCountOf`, `captureNamesOf`, `captureValKind`,
  `captureValStructIdx`, `cbIdentNamesFn`, `cloSigKeyExt`, `closureHeld`, `coalesceDefaultNullable`,
  `declaredIndexAt`, `envSlotShift`, `exprIsLitAtom`, `exprIsNulNone`, `exprIsStrConcat`, `exprIsStrMethod`,
  `exprMap`, `exprNullableMap`, `exprNullableRefArray`, `exprNullableRefNiche`, `exprUnion`,
  `exprVariantIndex`, `fnBundleRetSigs`, `fnIndexOfNode`, `fnRetHeldAsBundle`, `forInElemKind`,
  `forInElemTyOf`, `forInMapRecv`, `globalCellHeap`, `globalCellKind`, `globalCellStructIdx`,
  `holderMemberTy`, `holderRecordTy`, `identIsEnvCapture`, `letArmCellRow`, `letBindIsAtom`,
  `letBindIsNulAtom`, `letBindRep`, `letBindRepClaims`, `letBindTy`, `letCellKind`, `letNulMapReadUnionBox`,
  `localIndexOf`, `mapShapeOfExpr`, `memberBoxReadEnter`, `memberBoxReadLeave`, `memReadNarrowOp`,
  `nicheReadKindAt`, `nulLitAtomTexts`, `readOwesNonNullRecover`, `refListSlotOfExpr`, `sFieldIsUnionBox`,
  `sFieldStoreKind`, `spreadBoxingSource`, `stmtIsTailValue`, `structIndexOfExpr`, `structIndexOfObjCtx`,
  `tyOpenHeldAsIds`.
- `emit_closure_callee.vl`: `sigParamKindAt`, `sigParamSlotAt`.
- `emit_closure_sites.vl`: `fnSigIdxOfFn`.
- `emit_collect.vl`: `declSlotPinned`.
- `emit_elab.vl`: `bundleRecordTyOf`, `elabArmSigAt`, `elabHasHolderRecords`, `elabHasRetRecords`,
  `elabInstTyAt`, `elabSpreadNote`, `isStorageRead`, `readNarrowedStoreAt`, `storageReadEnter`,
  `storageReadLeave`.
- `emit_fn_ret_kinds.vl`: `cloSigPosOfKey`, `cloSigTypeIdxAt`, `fnCheckedRetTy`, `globalIndexOfSid`.
- `emit_fn_scans.vl`: `binEqStructRow`, `callSpillsFcpArg`, `elseLessNullableTail`, `exprIsStrEq`,
  `exprIsStrIndexOf`, `exprIsStrOrder`, `lastStmtIsValueIf`, `printUnionPlan`, `tailIsValueOrNever`.
- `emit_if_arm_values.vl`: `ifLinkYieldsNull`, `objOrderStashSlot`, `unionLitIsStashSlot`.
- `emit_lift.vl`: `cloLifted`, `cloLiftLetFe`.
- `emit_lit_atoms.vl`: `nulAtomWidenTexts`, `uFieldStorageSlot`.
- `emit_local_scope.vl`: `memNarrowVariantIndex`, `narrowedArmTyAt`.
- `emit_map_twins.vl`: `variantDiscrimFieldNeeded`, `variantFieldLitLexes`.
- `emit_map_value_slots.vl`: `mvValTyIxAt`, `tyRefArrElemOf`.
- `emit_mono.vl`: `monoBundleFe`, `monoBundleReadFe`.
- `emit_mv_slots.vl`: `scopeBind`, `scopeUnbind`.
- `emit_nullable_rets.vl`: `callAtCalleeResultRow`, `fnRetNullBearing`, `globalNameIsNonConstSid`,
  `paramStructIdxOf`, `vtKindOfParam`.
- `emit_plan_coerce.vl`: `boxOwedAt`, `boxTyNameAt`, `coerceKindAt`, `fnCloCoerceAtNode`, `instTyOrSelf`,
  `listCopyAtNode`, `narrowedArmNeedsUnbox`, `recCopyDstTyAt`, `recCopyRowAt`.
- `emit_plan_if_join.vl`: `ifJoinPlanOf`, `ifRefJoinOf`, `noRefJoin`, `strJoinDropsNulAtom`.
- `emit_plan_list.vl`: `allocLitChunk`, `arrLitArmOf`, `arrLitBuildAt`, `arrLitBuiltTyOf`,
  `arrLitListBuild`, `arrLitRefShortSlot`, `arrLitTyAt`, `arrLitUnionBoxSlot`, `forInLoopAt`,
  `forInPairSlotOf`, `idxStorePlanOf`, `listReserveScan`, `pushPlanOf`, `rangeConstIs`, `rangeConstVal`,
  `spreadBackIdx`, `spreadBoxDestRow`, `spreadPairKnown`, `spreadPlanOf`, `spreadWrapIdx`.
- `emit_plan_null.vl`: `binNulTestOf`, `coalArmOf`, `coalBoxArmOf`, `coalesceNulStrStaysNullable`,
  `coalNicheArmOf`, `coalNulRefArmOf`, `coalResultKindOf`, `coalValBoxArm`, `deadNullTestOperand`,
  `localNulStrRecovers`, `nullOwnAt`, `nullRetPlanOf`, `nulNoneEqSides`, `nulStrReadRecovers`,
  `nulTestArmOf`.
- `emit_plan_union.vl`: `arrLitVariantSlot`, `atomEqPlanOf`, `captureSlotOf`, `eqOperandRecovers`,
  `holeBoxPlanOf`, `identReadArmOf`, `identReadsNull`, `identUnboxAtomOf`, `isArmOf`, `isBoxGuardPlain`,
  `isDecidedPlanOf`, `isNulTestImpossible`, `isRecvStageRep`, `isVariantTagPlain`, `litIsArmOf`,
  `litIsMemberTexts`, `litMemberIsString`, `memberBoxReadAt`, `memberLengthArmOf`, `memFieldUnionBox`,
  `memRecvOwesNonNull`, `monoStaticIsResult`, `narrowedBoxVariantPlain`, `narrowedFieldIsUnionBox`,
  `narrowedFieldPlain`, `narrowedVariantRepIs`, `njDispatches`, `nullInstanceIsResult`, `numIsPlanOf`,
  `recoveredReadTyOf`, `structFieldPlain`, `tagIsArmOf`, `unionEqNameless`, `unionUnionEqStagedOf`,
  `variantCoerceArmOf`, `variantFieldPlain`, `widenPlanOf`.
- `emit_query.vl`: `blockHasContinueFor`, `coalLhsStashes`, `constFoldOfLet`, `constFoldWidthOk`,
  `exprIsIfStmt`, `ifArmValueExpr`, `letInitFoldsExpr`, `paramIndexOf`, `parTyNode`.
- `emit_reloc.vl`: `relSkew`, `relTrim`.
- `emit_rep.vl`: `repClosureOfReps`, `repNodeAt`, `repNodeGen`, `repNodeKids`, `repNodeOfTy`, `repOfTy`,
  `repRawOf`, `repRecordKidOf`, `repRowOfTyStruct`, `repScanLim`, `repSigKindOfTy`, `repTyOf`,
  `slotRowTyOf`.
- `emit_rewrite.vl`: `cboxElemTyOfCell`.
- `emit_shape_intern.vl`: `recordHeapOfTy`.
- `emit_shape_rows.vl`: `annTyOf`, `mvValVariantOf`, `rlElemVariantRow`, `rlSlotOfTyOrTwin`.
- `emit_sig_tokens.vl`: `sigKeyRetIsVoid`.
- `emit_start_block.vl`: `letBindingUnionTy`.
- `emit_state.vl`: `aTy`, `ba8Ty`, `bankSpanRow`, `bl8Ty`, `cboxReadsCell`, `cloLiftWriteCapAt`,
  `cloLiftWriteCount`, `cloLiftWriteSlot`, `fnStmtsPosOf`, `helpStrEqFn`, `helpStrHashFn`, `helpUtf8DecFn`,
  `liFrameRestore`, `liFrameSave`, `lTy`, `mkArrTy`, `mkListTy`, `mvValKindAt`, `rlRowsMinted`, `sBackTy`,
  `setIrShadowOn`, `sTy`, `synthMintCount`.
- `emit_struct_order.vl`: `declaredSlotOf`, `declaredSlotOfDecl`, `rlElemTyIxAt`, `sFieldIndex`.
- `emit_ty_canon.vl`: `mapRecvTyIn`, `nodeTyInOf`, `readContainerTyAt`.
- `emit_union_casts.vl`: `asExprNumCastDomain`, `mfCallbackLocal`, `sharedFieldRecvSlot`.
- `emit_value_sites.vl`: `forInStringSrc`, `forInU8Src`, `narrowedNulLitPinBoxKey`, `nulNicheRecoverOwed`,
  `scalarListElemKind`.

## Types, constants and variables (125)

- `wasmEmit.vl`: `BundlePick`, `CallRefArgArm`, `EmptyFitPlan`, `EQ_ROOT_EXPR`, `EqRootPlace`, `EqRootPlan`,
  `FieldStoreValArm`, `fitRecvReadHook`, `GlobalCtx`, `IntSwitchPlan`, `irNodeInShadowHook`, `MapGetOrArm`,
  `MapSetValArm`, `MapUnionPlan`, `ObjLitArm`, `PrintArm`, `REF_READ_CONTAINER`, `SRT_NARROW`,
  `StructFieldArm`, `VariantFieldArm`, `VariantIsArm`, `VariantRowArm`.
- `emit_plan_if_join.vl`: `RefJoin`.
- `emit_plan_list.vl`: `ArrLitArm`, `SpreadPlan`.
- `emit_plan_null.vl`: `BinNulTest`, `CoalBoxArm`, `CoalValArm`, `NULL_OWN_ATOM`, `NULL_OWN_BOOL`,
  `NULL_OWN_BOX`, `NULL_OWN_NONE`, `NULL_OWN_STR`, `NulTestArm`.
- `emit_plan_union.vl`: `HoleBox`, `IdentReadArm`, `IsArm`, `IsDecided`, `LitIsArm`, `TagIsArm`,
  `V128_ATOM_KIND`.
- `emit_ref_list_kinds.vl`: `ListBuild`.
- `emit_reloc.vl`: `RS_GNAME`, `RS_GREAD`, `RS_TAG`.
- `emit_rep.vl`: `RAtom`, `RBox`, `RClosure`, `RList`, `RMap`, `RNoValue`, `RNullable`, `RpPrim`, `RPrim`,
  `RRaw`, `RRecord`, `RUnsup`.
- `emit_start_block.vl`: `RC_MAP`, `RC_REF_LIST`.
- `emit_state.vl`: `AS_FAIL_DOMS`, `callRefDepth`, `ctrlDepth`, `dfeCallee`, `emitErr`, `emitFailed`,
  `emitFnSpanEnd`, `emitFnSpanKind`, `emitFnSpanNode`, `emitFnSpanStart`, `fbEagerScratch`, `fbFrameParams`,
  `fnMemAddrFoldCount`, `fnStmts`, `fnUses`, `fRecRetTy`, `fRetKind`, `fRetStructIdx`, `fRetVoid`,
  `gCellIdx`, `gConstExprEmit`, `gHelpF64Rem`, `gImports`, `gInitGIdx`, `gInitGLocs`, `gInitGNames`,
  `gInitProgAfter`, `gInitProgIdx`, `gInitReaders`, `globalStmtOrd`, `gMapDeletes`, `gMapGetMiss`,
  `gMapGetShape`, `gMapGetStrKey`, `gPromoInStart`, `ia64TypeIdx`, `LiFrame`, `liKinds`,
  `listIdxScratchBase`, `localIsRef`, `localStructIdx`, `loopBrkDepth`, `loopContDepth`, `monoGen`,
  `monoInstFe`, `monoInstOrig`, `monoOrigNode`, `rlWrapIdx`, `sFieldCount`, `sFieldNames`, `sFieldStart`,
  `shIdxFrom`, `shIdxNode`, `shIdxTo`, `startStmtOrd`, `startStmts`, `sTyIx`, `uBoxIdx`, `uBoxNewEnd`,
  `uFieldCount`, `uFieldStart`, `unionSinkBase`, `uTags`, `uVarRow`, `uVarTyIx`, `VKind`.
