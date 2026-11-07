# Exit checklist, re-census of 2026-11-07 (morning)

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Exit checklist, re-census of 2026-11-07** (master `7a471b8c`, 990 `emit_mono` functions). The 225
(d) functions of the 2026-11-06 census, rechecked. 60 are deleted, and 165 remain. Reach is the number of
programs, of 23,456, that enter the function, from a function-entry probe. It is not the arm count
used on 2026-11-06, so the two are not comparable digit for digit. Status comes from this section's
own records:
- **switched:** the decision reads the elaboration, and what is left is mechanics;
- **(c):** mono's own transformation or policy, named;
- **blocked:** waits on a named fact;
- **parked:** waits on a named design question;
- **unassessed:** no shadow recorded since 2026-11-06.

| family | listed | deleted | switched | (c) | blocked | parked | unassessed |
|---|---|---|---|---|---|---|---|
| unbound default | 12 | 3 | 4 | 1 | 2 | 1 | 1 |
| slot held fns | 29 | 6 | 5 | 10 | 4 | 2 | 2 |
| slot deliveries | 9 | 3 | 6 | 0 | 0 | 0 | 0 |
| node type | 29 | 4 | 2 | 5 | 8 | 0 | 10 |
| slot type | 27 | 3 | 7 | 0 | 1 | 1 | 15 |
| lambda sigs | 11 | 4 | 0 | 3 | 4 | 0 | 0 |
| instance binding | 34 | 3 | 5 | 11 | 2 | 1 | 12 |
| literal arm row | 5 | 5 | 0 | 0 | 0 | 0 | 0 |
| value returns | 7 | 2 | 1 | 3 | 1 | 0 | 0 |
| instance result | 10 | 9 | 1 | 0 | 0 | 0 | 0 |
| walk type | 33 | 14 | 6 | 11 | 2 | 0 | 0 |
| call param | 13 | 0 | 1 | 0 | 7 | 0 | 5 |
| uncalled slot | 6 | 4 | 0 | 2 | 0 | 0 | 0 |
| **all** | **225** | **60** | **38** | **46** | **31** | **5** | **45** |

The endpoint is every (d) function switched, deleted or named (c). Two lists stand between here
and there: the 36 blocked or parked functions, which wait on the facts and questions
below, and the 45 unassessed ones, which are lane work that needs no new fact before its
shadow. Per family, by status, each with its reach:

- **unbound default**:
  - blocked: `monoElabDefaultsPrime` 17,747 (reach: the unbound default), `monoDefaultUnboundTyParams` 8,897 (reach: the unbound default).
  - parked: `monoDefaultTyParamsOnlyGenFns` 8,601 (per-call rule no elaboration fact states (10 sites)).
  - switched: `monoHoleFnPinTyOf` 13, `monoArgClosedPin` 5,405, `monoUncalledSlotFnTy` 272, `monoUncalledListElems` 198, `monoUncalledNestedListElems` 11.
  - (c): `monoChoiceArmFlowTy` 7,824.
- **slot held fns**:
  - blocked: `monoWrittenGenLetFrame` 9,451 (split-dep: written-let slot fact (initialiser-fallback fix) + D4307 set join), `monoCoerceWrittenLetTys` 5,748 (split-dep: written-let per-instance signature), `monoArmWrittenLetSeed` 1,620 (split-dep: as monoWrittenGenLetFrame), `monoLetSeedGenFe` 0 (split-dep: as monoWrittenGenLetFrame).
  - parked: `monoWalkIdentCall` 9,452 ((S3): derivation waits on argument-keyed instances / reverse map; call_ref policy is mono), `monoCellCall` 255 (callee choice is call_ref policy (16/16 agree); coercion half waits on split-dep).
  - parked: `monoFlowMapReadVals` 286, `monoFlowAliasMaps` 225 (lane F: the map-value facts, beside the six `Map()` bundle reads).
    Scoped 2026-11-07. Both are the PRODUCER side, what a map stores; `elabSlotDeliveries(d,
    ["v"])` answers the consumer side and replaces neither. `monoFlowMapReadVals` already reads
    `cwSlotWrittenValues(owner, ["[]"])` through `mfrLitsMapStored`, so only the root expansion is
    mono's. `monoFlowAliasMaps` is a root-set soundness test (a binding handed a map holds no other
    map), tied to D9480's per-instance mint, not a type decision. The climb after a map read in
    `monoFlowUsePlanAt` needs the use node and `elabSlotDeliveries` returns types, so no
    node-returning climb is added for it. `monoFlowMapVals` takes its alias writes from
    `cwSlotWrittenValues` (the writes not through the owner), which follows every handle,
    annotated parameters and calls two deep included (D14648), where mono's own chase followed
    un-annotated parameters and `const`s one hop at a time.
  - switched: `monoFlowDeclVals` 7,946, `monoFlowLetLeaf` 656, `monoFlowKeptIndexElem` 516, `monoFlowValsOf` 81, `monoFlowLetMapLeaf` 75.
  - (c): `monoFlowReadsAll` 9,453, `monoFlowReadsRound` 9,453, `monoFlowReplanPending` 9,453, `monoFlowLetCalls` 7,932, `monoFlowUsePlanAt` 2,907, `monoFlowUsePlan` 2,907, `monoFlowAliasReadVals` 1,182, `monoFlowMapVals` 373, `monoFlowElemsGen` 131, `monoFlowRetLocalLists` 89.
- **slot deliveries**:
  - switched: `monoCallIfBound` 9,451, `monoCallWrittenLet` 9,450, `monoPinListElems` 6,715, `monoCoerceWrittenCell` 919, `monoStoredSlotFnTy` 113, `monoRetLitElemTy` 65.
- **node type**:
  - blocked: `monoInitHeldTy` 6,662 (Fn#d: adopt-init's mono-only holders), `monoArgClosedTyIn` 5,458 (Fn#d: hole-function arguments outside an instance), `monoCoerceListCbArg` 2,840 (both halves must read the elaboration), `monoPinReturnedObj` 1,973 (Fn#d: d3125 lambdas returning records), `monoRetFnListTy` 581 (Fn#d: returned lists of hole lambdas), `monoBoundFnListElemsTy` 322 (Fn#d: nested lists of hole lambdas), `monoClosedObjLitTy` 163 (Fn#d: records holding functions), `monoCloseRetFnTy` 1 (Fn#d: elaboration declines function-holding types).
  - unassessed: `monoCgcTplTy` 1,725, `monoCbFnListRowSpell` 1,105, `monoLetAnnTyOf` 46, `monoHoleFnPinTy` 23, `monoLetWriteRhsTyRec` 13, `monoLetWriteRhsTy` 13, `monoLetWritesRecord` 5, `monoClosedFieldValTy` 4, `monoModuleDupPin` 2, `monoModuleLetPin` 0.
  - switched: `monoPinnedListAnnTy` 789, `monoPinnedAnnTyAt` 2.
  - (c): `monoPinnedOperandTy` 4,789, `monoPinBin` 4,269, `monoSubstLetType` 3,320, `monoCloneLetDecl` 3,302, `monoDeadNullTest` 879.
- **slot type**:
  - blocked: `monoHandWrittenLet` 2 (split-dep: written-let signature).
  - parked: `monoReachSlotTy` 6,855 (parked: 13 lane F, 2 reach).
  - unassessed: `monoReachLitTys` 9,453, `monoNoteBindCall` 8,602, `monoListSrcElemTy` 7,828, `monoPinFieldContainers` 789, `monoLetWritesClosed` 729, `monoPinObjFields` 685, `monoRetypeLamCells` 558, `monoWritesCoercedFirstCall` 437, `monoPinFieldContainer` 112, `monoPinFieldValue` 110, `monoLetWritesAt` 31, `monoPinJoin` 24, `monoSigJoin` 24, `monoPinStoredRecords` 14, `monoRenameInitAt` 13.
  - switched: `monoBindingAdoptInit` 9,453, `monoHoleGenFnPin` 7,850, `monoPinMapValues` 6,658, `monoPinRecordFields` 728, `monoPinRecordField` 461, `monoPinNestedListElems` 281, `monoPinMapSlot` 48.
- **lambda sigs**:
  - blocked: `monoPinMapLambdas` 8,903 (lane F: waits), `monoNoteBindDeliveryCall` 7,123 (lane F: waits), `monoLamSubstParams` 1,175 (lane F), `monoLamParamPinAnn` 795 (split-dep holder fact (c2) + per-instance identity residual (4b-i)).
  - (c): `monoPinBodyLambdasRaw` 8,887, `monoDeliverLamLit` 6,133, `monoCloneLambdaSubst` 1,244.
- **instance binding**:
  - blocked: `monoPinTyParamComposite` 396 (Fn#d call-param hub), `monoSeedCallSigTys` 0 (call param: monoCallIfValue (inline if, no binding)).
  - parked: `monoPinnedTyParamCanon` 981 (waits on the key settling names).
  - unassessed: `monoHoleBinding` 8,896, `monoNicheNulParamsCheck` 8,890, `monoBindBareUnionArm` 8,875, `monoBindNullArm` 8,856, `monoBindInnerUnionArms` 8,853, `monoPreBindPastUnionRest` 8,599, `monoLetTyParamMisfit` 8,583, `monoExactPinTyOf` 8,557, `monoNicheNulListCheck` 5,671, `monoParamPinnedNull` 5,538, `monoPoisonSharedPins` 2,666, `monoLetSeedMisfits` 1,239.
  - switched: `monoPreBindPastEmptyLit` 8,595, `monoPinAnnotatedParam` 5,687, `monoExactBind` 1,260, `monoInstParamPinTys` 438, `monoPreBindNonArrowArgs` 45.
  - (c): `monoCadNoteInstance` 8,903, `monoBindCols` 8,884, `monoMakeInstanceLetTyCol` 8,876, `monoBindEnclosingPins` 8,871, `monoMakeInstanceGo` 8,844, `monoSlotParamPins` 8,615, `monoSlotSig` 8,611, `monoInstantiateCallIn` 8,598, `monoSubstAnnNode` 1,214, `monoSubstTyArgNodes` 46, `monoLayoutConstOf` 4.
- **literal arm row**:
- **value returns**:
  - switched: `monoIfBoundRetAtPin` 24.
  - (c): `monoDeliverCallRets` 1,019 (its gate's recursion is walk state), `monoFlowConstCallArgs` 7,932, `monoFlowCallLeafAt` 176, `monoFlowCallLeaf` 176.
- **instance result**:
  - switched: `monoPinnedRetAnnTy` 1.
- **walk type**:
  - blocked: `monoPinnedTyOf` 7,280 (lambda bodies need an elaboration instance (D3616)), `monoLamCallTy` 528 (lambda bodies need an elaboration instance (D3616)).
  - switched: `monoPinCoalJoin` 2,679, `monoIfChainRebuildPinned` 2,635, `monoLamPinRetAnn` 1,101, `monoPinCoalListDefault` 776, `monoHoleNodeTy` 668, `monoNumOperandPinTy` 241.
  - (c): `monoExprRebuild` 7,378, `monoPinRetype` 7,262, `monoPinFnValueTy` 4,889, `monoPinRecvName` 3,392, `monoPinRecvLit` 3,390, `monoPinMemberCall` 1,226, `monoNumUnionOpPin` 797, `monoHoleCoalUnion` 329, `monoTpJoinObjTy` 53, `monoSubstIsExpr` 52, `monoNumUnionCompoundPin` 1.
- **call param**:
  - blocked: `monoArgPinTyIx` 5,570 (needs a pin fact of its own after holes-close), `monoArgTyName` 5,405 (split-dep: one producer (cascade serves three facts)), `monoArgPinName` 5,354 (rep cascade, mono-derived rung), `monoCallIfValue` 2,836 (call param: inline if with no binding), `monoArgTyNameCascade` 312 (split-dep: as monoArgTyName), `monoArgTyNameProjected` 211 (split-dep: as monoArgTyName), `monoArgTyNameRep` 208 (split-dep: as monoArgTyName (scalar tail unreached, D23)).
  - unassessed: `monoBindSeededTyParams` 8,594, `monoArgTyNameBound` 309.
  - switched: `monoPinHoleParam` 3,667, `monoPreBindArgName` 193, `monoPreBindArgTy` 192.
  - deleted: `monoSpelledRecordLeavesRow` 188.
- **uncalled slot**:
  - (c): `monoInertReach` 9,453, `monoInertParamStubPin` 4,682.
