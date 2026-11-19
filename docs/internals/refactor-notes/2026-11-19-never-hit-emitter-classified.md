# The never-hit emitter functions, classified (2026-11-19, lane DEAD)

`scripts/ir-driver-census.sh` on master 722b84dc, with `$CENSUS_PROGRAMS` naming every distilled
cell and every non-`error-*` program under tests/cases (20,130 programs), finds **419 emitter
functions, 6,395 lines, that are never called with claiming off** (`hits_claim_off` 0), not by the
self-compile and not by any of those programs. Never hit is not dead. This note says what reaches
each of them, measured by running the census's own probe compiler over more inputs.

## Method

Every row below is a dynamic measurement: the census's instrumented compiler (`dh(<id>)` as the
first statement of every multi-line top-level function of `wasmEmit.vl` and `emit_*.vl`, built
from 722b84dc) compiles the extra inputs under `$VL_IR_SHADOW=1`, and a function counts as reached
when its counter is non-zero. The one static measurement is the reachability pass: a
name-reference graph over `compiler/*.vl` rooted at every token of `entry.vl` and every token
outside a function body, import clauses excluded.

| Reached by | How it was measured | Functions | Lines | Bucket |
|---|---|---:|---:|---|
| nothing, statically | the reachability pass | 13 | 125 | 2: deleted in #9120 (with 6 `check_*` functions the census does not instrument) |
| `RELOC_ARMED` only | `emit_link`, `emit_reloc`, `emit_reloc_keys`: the S5 link proof, armed by flipping the const in a scratch build (`s5-per-module-artifacts.md`; S5 is in progress) | 67 | 1,397 | 4: kept |
| a probe a script or test arms | `*Shadow*`, `*Census*`, `emit_row_dump`, `emit_cls_census`, `emit_id_shadow`, `emit_heap_shadow`, `emit_vk_shadow`; each has a user under scripts/ or tests/ | 49 | 665 | 4: kept |
| the corpus the census skipped | `vl check --codegen` over 2,972 more programs: the `error-*` cases, `scripts/**/*.vl`, `std/*.vl`, `bench/`, `tests/fixtures/`, `scripts/capability-probes/` | 4 | 50 | 1 |
| a build flag | `vl build` over the 9,684 programs (all but the distilled cells, plus the capability probes) with `-O --low-memory-unused=65536 --names --source-map --wat --stable-layout`, and a 2,500-program sample with `-O3 --import-memory --shared-memory=16 --heap-base=0x2000` and with `--initial-memory=128KiB --max-memory=1MiB --heap-limit=0x100000 --names` | 34 | 503 | 1 |
| a `$VL_*` probe | `vl check --codegen` over the 2,500 sample with `VL_REP_SHADOW=1 VL_ID_SHADOW=2 VL_INST_KEYS=1 VL_LATE_DEMANDS=1 VL_OPAQUE_SNAMES=1 VL_IFACES=1 VL_TOUCH_SET=1 VL_CHECK_STATS=1 VL_CLS_CENSUS=1` | 30 | 335 | 1 |
| a flag, through a written program | the low-memory accessor inline (`emitLowMemAccessorCall`, `lma*`): `get(q + 16)` of a one-access i64-address accessor under `-O --low-memory-unused`; three tests in `tests/vl_memarg_offset_test.ts` cover it | 5 | 92 | 1 |
| a Deno test's own program | the whole `deno test --parallel tests/` with `SELFHOST_NATIVE_ALIGN=1`, through a `vl` wrapper that logged the probe's rows, with the probe as `build/vl-compiler.wasm` | 8 | 133 | 1 |
| **none of the above** | | **209** | **3,095** | 3, or 2 behind a guard nobody has proved impossible |

The Deno run reaches 85 of the 419 in all. Its row counts only the 8 that no earlier row reached.

## The guarded residue

The 209 hang off **151 guards**. A guard here is a never-hit function that a function the census
does hit names. The dead functions reachable only through it are counted with it. They own 2,755
of the 3,095 lines; the rest are reachable through more than one guard. Each guard is either a
program shape the corpus lacks (bucket 3), or a condition that cannot hold (bucket 2), which takes
an argument per guard. Fifteen programs written against the largest guards were all bucket 3 or
undecided: each ran without reaching the guard, or the checker rejected it first. Examples are
`genericFnValueRejectMsg` (a hole function as a value, in every position tried),
`emitUnionRetIfSink`, `elabWrittenBuiltTy`, `emitIndexNulScalarList`, `emitListUnionForFlat`, and
the D1461 floor `variantLitRepMismatch`, whose own comment calls it unreachable. Deleting
guard by guard was stopped here: a few hundred lines that each need an impossibility proof are
worth less than IR coverage. A guard that is deleted later needs that proof in its PR.

Two guards are known not to be dead:
- `canonSameGo` is reached only through `canonShadowCmp` under `$VL_ID_SHADOW`.
- `runtimeFnNames` and `fnSymKeys` are behind `RELOC_ARMED`.

| Guard | Lines | Dead functions | Its hit caller(s) |
|---|---:|---:|---|
| `emit_obj_lit_fits:objLitFitsRow` | 113 | 7 | `objNestedFieldCompat` |
| `emit_closure_sites:fieldCloCallIsBool` | 104 | 5 | `exprIsBool` |
| `emit_mono:genericFnValueRejectMsg` | 98 | 2 | `closureValueWhy` |
| `emit_elab:elabWrittenBuiltTy` | 80 | 2 | `elabWrittenValueTy` |
| `emit_ty_seal:canonSameGo` | 79 | 2 | `canonOf` |
| `emit_collect:checkLocalI32` | 75 | 2 | `letLocalSlot` |
| `wasmEmit:emitUnionRetIfSink` | 67 | 3 | `emitReturnExit` |
| `wasmEmit:emitUnionFieldTagDispatch` | 63 | 3 | `emitUnionFieldNarrowUnbox` |
| `emit_elab:elabCallRetFnListTy` | 61 | 2 | `elabWrittenValueTy` |
| `wasmEmit:emitUnionCoerceMapElemList` | 59 | 2 | `emitUnionCoerceList` |
| `wasmEmit:emitCoalesceOptListGet` | 47 | 1 | `emitCoalesceOptMember` |
| `emit_mono:monoUnemittedNodes` | 47 | 2 | `monoNamesUsedAsValue` |
| `emit_obj_lit_fits:tyReachesFuncD` | 46 | 2 | `monoObjDiffersInFnFieldsAt` |
| `emit_mono:monoHandWrittenLet` | 45 | 1 | `monoPinTyParamComposite` |
| `emit_elab:elabGenAtParamCalls` | 44 | 1 | `elabHeldNamedGen` |
| `emit_closure_sites:callIsElemOrArgIn` | 44 | 3 | `cloTailRefusal` |
| `wasmEmit:emitListUnionForFlat` | 41 | 1 | `emitListUnionFor` |
| `emit_sections:structRowsLate` | 41 | 2 | `emitModule` |
| `emit_sig_tokens:unRowOfFlatMembers` | 40 | 3 | `mapUnionResultRow`, `nestedUnionRowName` |
| `emit_sections:runtimeFnNames` | 40 | 2 | `emitModule` |
| `emit_closure_sites:cloCallArityFallbackUnsound` | 39 | 2 | `emitCallRefAt` |
| `emit_closure_sites:cloCallSigRejectWhat` | 37 | 1 | `emitCallRefAt` |
| `wasmEmit:emitIndexNulScalarList` | 35 | 1 | `emitIndex` |
| `emit_union_atoms:unionRefArrayArmSlotForNestedElem` | 35 | 2 | `emitUnionListLitViaRefArm` |
| `emit_elab:elabFreshMapSlotTy` | 35 | 1 | `elabHeldClosedGo` |
| `wasmEmit:emitCoalesceOptNulVariant` | 33 | 1 | `emitCoalesceOptMember` |
| `emit_closure_sites:cloSigRejectWhat` | 32 | 1 | `closureValueCoreWhy` |
| `emit_union_atoms:unionNestedArrayArmSlot` | 31 | 1 | `emitUnionNestedListLit` |
| `wasmEmit:emitRefListWidenDeclined` | 30 | 1 | `emitRefListCopy` |
| `emit_map_twins:variantLitRepMismatch` | 30 | 1 | `assignTags` |
| `emit_sections:fnSymKeys` | 28 | 1 | `emitModule`, `emitRelocSection` |
| `emit_nullable_rets:nulScalarListBuildKind` | 28 | 1 | `eqgListKindOfExpr`, `exprListCellBuildKind`, `listBuildKindOfVKind` |
| `emit_collect:promoteLitFieldToAtom` | 28 | 1 | `reLayLitFieldsByName`, `unifyMixedLitRepArms` |
| `wasmEmit:emitNulStrToNulAtom` | 26 | 2 | `emitExpr` |
| `emit_elab:elabEarlyCallRows` | 26 | 1 | `elabRun` |
| `wasmEmit:emitTagParamHolds` | 25 | 1 | `emitTagSetAt` |
| `wasmEmit:emitDestStrToAtom` | 24 | 1 | `emitPushValue` |
| `wasmEmit:nestedFnReadsDisjoint` | 23 | 1 | `listFitShadowSet` |
| `emit_shape_rows:arrLitObjBesideNonRecord` | 23 | 1 | `arrLitInferUnionElemName` |
| `wasmEmit:ifArmNoValueFail` | 22 | 1 | `emitBlockValueAsGo`, `emitRefIfArm`, `emitUnionIfArm`, `emitVariantIfArm` |
| `emit_if_arm_values:nulIfArmNullableValueIx` | 22 | 1 | `ifRepArmValueIx` |
| `emit_elab:elabHoleMapClosed` | 21 | 1 | `elabHeldClosedGo` |
| `emit_classify:ovnStoredAlike` | 21 | 1 | `objVariantRowCtx` |
| `wasmEmit:emitNulStrJoinAsAtom` | 18 | 1 | `emitReturnPlainValue` |
| `emit_obj_lit_fits:sharedFieldPlanLitTy` | 18 | 1 | `litAtomMemberTyAt` |
| `emit_elab:elabCallKeyDecline` | 18 | 1 | `monoMakeInstanceGo` |
| `wasmEmit:emitCoalesceBoolPop` | 15 | 1 | `emitCoalesceIdentBox` |
| `wasmEmit:emitBoxToNulStr` | 15 | 1 | `emitDirectArgValue`, `emitReturnPlainValue` |
| `emit_sig_tokens:tyIsUnionMemberOf` | 15 | 1 | `emitIsTestVariant` |
| `emit_rep:unRowOfNullableOver` | 15 | 1 | `rtNulElemListVKind` |
| `emit_nullable_rets:namedRowOfTy` | 15 | 1 | `nulBaseStructRow` |
| `emit_map_twins:variantFirstLayoutDisagreeField` | 15 | 1 | `assignTags` |
| `emit_elab:elabAllFreshMaps` | 15 | 1 | `elabHeldClosedGo` |
| `emit_collect:tyElemRidesI32List` | 15 | 1 | `forceAnnLeafRepsOfTy` |
| `wasmEmit:liftedFnReadsDisjoint` | 14 | 1 | `listFitShadowSet` |
| `emit_mono:monoCoalDefaultClashesPin` | 14 | 1 | `monoRetReachesClash` |
| `wasmEmit:isTagWhollyTested` | 13 | 1 | `emitIsTestVariant` |
| `emit_mono:monoLetWrittenLive` | 13 | 1 | `monoWriteNamesLam` |
| `emit_elab:elabHoleFnDecl` | 13 | 1 | `elabMintParamRowFactAt` |
| `emit_type_order:scanCatches` | 12 | 1 | `scanOp` |
| `emit_classify:unionKeyRowOfOperator` | 12 | 1 | `unionNameOfExpr` |
| `wasmEmit:emitBoxAtomRetag` | 11 | 1 | `emitCoalesceUnionField` |
| `emit_union_atoms:tyArmUseBits` | 11 | 1 | `markValueUnionArms` |
| `emit_union_atoms:elemUnionHasLitUnionMember` | 11 | 1 | `unionRefArrayArmSlotForElemAtom` |
| `emit_rep:pkTwinNote` | 11 | 1 | `armUseBits`, `scalarTagOfKind` |
| `emit_collect:annSpellingOfTyIx` | 11 | 1 | `guardFiniteUserTypes` |
| `wasmEmit:fnTagArmsOneTy` | 10 | 1 | `emitFnTagDispatch` |
| `wasmEmit:bundleSlotTakesRecord` | 10 | 1 | `emitCallRefAt` |
| `emit_type_order:scanTags` | 10 | 1 | `toScanAll` |
| `emit_mono:monoLamInstanceNamed` | 10 | 1 | `monoCellValueTakeAt` |
| `emit_mono:monoHoleTwoPinsFail` | 10 | 1 | `monoPinAnnotatedParam`, `monoPinHoleParam` |
| `emit_closure_callee:bcGet` | 10 | 1 | `spineFloatLeafBits` |
| `emit_classify:coalDefaultEndsInHoleMapRead` | 10 | 1 | `unionNameOfExprGo` |
| `wasmEmit:refuseJoinDropsNul` | 9 | 1 | `emitIfExpr`, `emitIfExprRef` |
| `wasmEmit:memFloorMsg` | 9 | 1 | `emitMemStructRead` |
| `wasmEmit:emitFailCrossTagDelivery` | 9 | 1 | `emitCallRefArg`, `emitDirectArgUnbox`, `emitVariantCoerce` |
| `wasmEmit:coalCallRecvOf` | 9 | 1 | `coalMapRecvOf` |
| `wasmEmit:boxFloorWhy` | 9 | 1 | `emitUnionBoxOwed` |
| `emit_sections:rvUnreachableBody` | 9 | 1 | `rvGetFnCode`, `rvLenFnCode`, `rvSyncFnCode` |
| `emit_ref_list_kinds:tyIsRecordUnion` | 9 | 1 | `arrLitInferUnionElemName` |
| `emit_mono:monoFwdFnPinFail` | 9 | 1 | `monoPinAnnotatedParam`, `monoPinHoleParam` |
| `emit_mono:monoCellWriterSigFail` | 9 | 1 | `monoCoerceWrittenCell` |
| `emit_fn_ret_kinds:fnSigIdxForArity` | 9 | 1 | `emitCallRefAt` |
| `emit_field_codes:tyHasStructRowShallow` | 9 | 1 | `fieldCodeForMatch` |
| `emit_elab:elabSameCtor` | 9 | 1 | `elabSlotReadTy` |
| `emit_classify:fnCapturesName` | 9 | 1 | `identNameIsBoundAt`, `identNameIsUserBound` |
| `emit_base:pushUniqueAtom` | 9 | 1 | `holeRecvAtomFieldTexts`, `memberAtomFieldTexts` |
| `wasmEmit:unionBoxHasNoRow` | 8 | 1 | `emitUnionCoerceRecord` |
| `wasmEmit:liftedFnCaptures` | 8 | 1 | `emitListEmptyFitIs` |
| `wasmEmit:emitBoxAmbiguousFail` | 8 | 1 | `emitCoalesceUnionField`, `emitMemStructRead` |
| `wasmEmit:coalSoleStmt` | 8 | 1 | `coalNullArmIf`, `coalNullArmShaped` |
| `emit_shape_rows:rowOfTyUpToFnSets` | 8 | 1 | `rlElemStructRowOfName` |
| `emit_sections:exportRootGlobals` | 8 | 1 | `emitModule` |
| `emit_mono:monoPrimHasRep` | 8 | 1 | `monoAnnPinOkTy`, `monoListPinOk` |
| `emit_mono:monoGenericListFail` | 8 | 1 | `monoPinListElems` |
| `emit_mono:monoCellValueFail` | 8 | 1 | `monoCoerceWrittenCell` |
| `emit_mono:monoCellAliasListFail` | 8 | 1 | `monoWalk`, `monoWalkLetDecl` |
| `emit_classify:forInPairUnionElemName` | 8 | 1 | `capturedUnionName`, `forInLoopVarUnionName` |
| `wasmEmit:unionPackedListKindOfTy` | 7 | 1 | `coerceListAtomOf` |
| `emit_state:pkElemNameOfRow` | 7 | 1 | `refAtomElemName` |
| `emit_rewrite:cboxNoInitMsg` | 7 | 1 | `cboxPick` |
| `emit_nullable_rets:asgTargetIsCell` | 7 | 1 | `assignTargetSpills` |
| `emit_mono:monoFnSentenceName` | 7 | 1 | `monoDeliverCallRets` |
| `emit_classify:sharedPlanNumKind` | 7 | 1 | `memFieldNumKind` |
| `wasmEmit:scalarListKindUnlisted` | 6 | 1 | `scalarListBack`, `scalarListBlocktype`, `scalarListWrap` |
| `wasmEmit:refListRowRefused` | 6 | 1 | `emitArrSlice`, `emitClear`, `emitIndexRefList`, `emitPopGo`, `forInBackingOf`, `idxStoreClassify`, `mfDstTysOf`, `mfSrcTysOf`, `pushSlotOf` |
| `wasmEmit:ifPlainDisagrees` | 6 | 1 | `emitIfExpr` |
| `wasmEmit:armFloorWhy` | 6 | 1 | `armClose` |
| `emit_ty_canon:mapValBase` | 6 | 1 | `mapNicheLacks` |
| `emit_shape_rows:sRowOpenTolerated` | 6 | 1 | `sFieldMapShape` |
| `emit_nullable_rets:mapRecordedCallShape` | 6 | 1 | `fnRetMapShapeAt` |
| `emit_fn_scans:readsGlobalAtomCell` | 6 | 1 | `memberLenWidensAtom` |
| `emit_classify:spreadNulInnerIsElem` | 6 | 1 | `spreadBoxingSource` |
| `emit_atom_kinds:armRowNoRep` | 6 | 1 | `armRowIsNulAtom`, `armRowIsPlainI32`, `armRowIsRecordRef`, `armRowIsStr`, `armRowIsUnionBox`, `variantFieldIsNulNone`, `variantFieldIsStr`, `variantFieldNumKind`, `variantFie` |
| `wasmEmit:recNeverFitsArm` | 5 | 1 | `emitIsTestVariant` |
| `wasmEmit:narrowedArmTyOf` | 5 | 1 | `narrowedArmTyAt`, `narrowedFromTyCopy`, `printArgIsBoxName` |
| `wasmEmit:failMapValueType` | 5 | 1 | `emitMapClear`, `emitMapKeys`, `emitMapNew`, `emitMapRecvKey`, `emitMapValues` |
| `wasmEmit:emitFailNoMembershipRecv` | 5 | 1 | `emitIsArm`, `emitIsTestLitArms`, `emitListEmptyFitArms`, `emitVariantDiscrimTest` |
| `wasmEmit:coalCallKeyOf` | 5 | 1 | `coalMapKeyOf` |
| `wasmEmit:boxDstFormOf` | 5 | 1 | `emitUnionBoxArg`, `emitUnionCoerce` |
| `emit_union_atoms:unionNameOfVariant` | 5 | 1 | `arrLitElemNameTpl` |
| `emit_state:pkTwinCodeOfRow` | 5 | 1 | `listWrapHeapOfKind`, `scalarTagOfKind` |
| `emit_ref_list_kinds:emptyArrHoleBuildSlot` | 5 | 1 | `emitArrUnder` |
| `emit_obj_lit_fits:fieldValueIsScalarLit` | 5 | 1 | `variantFieldKindFits` |
| `emit_mono:monoAnonListPinName` | 5 | 1 | `monoArgTyNameRep` |
| `emit_map_value_slots:annRlNulAt` | 5 | 1 | `annTyNulFlag` |
| `emit_collect:rlListOfRowMinted` | 5 | 1 | `collectUnionAndHeldRows` |
| `emit_closure_callee:bcPut` | 5 | 1 | `spineFloatLeafBits` |
| `emit_classify:mfListResultElemName` | 5 | 1 | `refListKeptSlotOfCall` |
| `emit_classify:coalTyIsStr` | 5 | 1 | `exprString` |
| `emit_bytes:ropeAt` | 5 | 1 | `rbyteAt`, `relPlaceSections` |
| `emit_atom_kinds:tyIsRefShaped` | 5 | 1 | `pinKindFitsTy` |
| `wasmEmit:listFitRepMiss` | 4 | 1 | `listFitScalarOf` |
| `wasmEmit:emitArrLenHeld` | 4 | 1 | `emitArrLen`, `lowerLen` |
| `emit_type_order:typeOrderOldOf` | 4 | 1 | `emitTypeLabel` |
| `emit_mono:pluralS` | 4 | 1 | `monoInstanceForReq` |
| `emit_map_value_slots:tyIsNullPrim` | 4 | 1 | `scalarNullOtherOfTy` |
| `emit_elab:elabNarrowArmAt` | 4 | 1 | `narrowedArmTyAt` |
| `emit_elab:elabMakerTwinParamTy` | 4 | 1 | `monoMakerTwin` |
| `emit_elab:elabHeldDemands` | 4 | 1 | `elabHeldAtArgsOr` |
| `emit_elab:elabErrorsMuteSet` | 4 | 1 | `checkSrc` |
| `emit_collect:fieldNamesDeclRecord` | 4 | 1 | `collectVariantFields` |
| `emit_classify:callNameFloor` | 4 | 1 | `unionNameOfCall` |
| `emit_bytes:fbF32Le` | 4 | 1 | `emitNumExactTest` |
| `emit_base:parentLetOwnedBy` | 4 | 1 | `identIsBoundClosureGo` |
| `emit_base:litRunAfter` | 4 | 1 | `litUtf8` |
| `emit_ty_seal:tyRepIdProvisional` | 3 | 1 | `repTreeOfTy` |
| `emit_ty_canon:tyIsMapAt` | 3 | 1 | `mapRecvTyIn`, `slotCallClause`, `slotRecvClause` |
| `emit_state:isMkArrTy` | 3 | 1 | `emitTypeLabel` |
| `emit_state:isMapTy` | 3 | 1 | `emitTypeLabel` |
| `emit_closure_callee:bcInWindow` | 3 | 1 | `bcSpineEnter` |

## Regenerating

Each step is one command over the census's kept probe (`KEEP=1 scripts/ir-driver-census.sh`
leaves it in its temp dir: `probe.wasm`, `names`, `one.sh`):
- the census itself: `CENSUS_PROGRAMS=<list> scripts/ir-driver-census.sh <master seed> out.tsv`
  on a fixpoint seed, run alone (about 20 minutes at `JOBS=4`); the set is the rows whose
  `hits_claim_off` is 0;
- each further row: compile its inputs with the probe under `$VL_IR_SHADOW=1` (plus the row's
  flags or variables), sum the `[ir] … drv <id>` rows by `names`, and take the set of ids above 0.
