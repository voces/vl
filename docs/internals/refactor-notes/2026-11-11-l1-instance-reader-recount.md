# L1: the instance readers re-counted, 2026-11-11

Docs-only. Base is master `2fb114d7`. This updates the §3.5/§4.1 line of `ARCHITECTURE.md` §7,
whose open rows had all closed on 2026-10-25.

## The open rows

`check-filed-witnesses --strict` on both inventories (4,721 graded, 0 moved): D13200, D13260,
D13261, D13280, D13281 and D13282 each run, and each row's status line says closed 2026-10-25.

## The (c) literal

It was the emit refusal for a function value with no flow entry, to be armed once the flow
table's shadow showed no disagreement in a fixture that runs (613 of 3,334 disagreed, measured
for D4891). The flow table, its shadow and `monoBindingSigConflict` are no longer in the tree;
the pins are the elaboration's (`elabHoleGenFlowTy`, `elabHoleGenFlowHolder`). The refusal a
function value with no fixing call gets is the loud `emitProgram: a generic function taken as a
value reaches no call that fixes its type`, a row of `scripts/capability-probes/live-sites.json`
with its probe (D10370). Nothing is left to arm.

## The raw reads

The instrument, rebuilt for this note in a scratch tree (it is not committed, and it poisons a
seed): every non-comment `nodeTyIxOf(` call in `compiler/emit_*.vl` and `wasmEmit.vl` (959) goes
through a probe that marks its site when the result holds a type parameter while
`emitCurFnIx` is a function whose name carries `$` (a mono instance). A compile with a marked
site fails with the site list, so only programs whose emit otherwise succeeds are counted.

Population: every `.vl` under `tests/cases` and `scripts/silent-sweep/distilled`, 19,544 files.
2,948 files mark at least one site, and 94 sites are marked. The 2026-10-24 count, by #4712's
instrument over 16,727 files, was 78 of 834, each one classified by design. That class split
has not been redone for the 94. The elaboration's 15 include its reads of the template's type,
which are by design (`elabCheckedTyOf`, `litRepTyIn`, `litRepTyAt`).

| file | function | files marking it |
| --- | --- | --- |
| emit_capture_frames.vl | `nodeTyAt` | 381 |
| emit_capture_frames.vl | `scopeTyAt` | 2944 |
| emit_classify.vl | `arrLitArenaRecElem` | 1 |
| emit_classify.vl | `arrLitArenaRecElem` | 8 |
| emit_classify.vl | `arrLitElemNameTpl` | 6 |
| emit_classify.vl | `arrLitFrameRefTy` | 117 |
| emit_classify.vl | `arrLitIsRefTpl` | 90 |
| emit_classify.vl | `assignTargetReReads` | 22 |
| emit_classify.vl | `blockTailIsClosure` | 14 |
| emit_classify.vl | `cloCallSigKey` | 3 |
| emit_classify.vl | `cloCallSigKey` | 17 |
| emit_classify.vl | `cloCallSigKey` | 29 |
| emit_classify.vl | `cloElabSigKey` | 80 |
| emit_classify.vl | `coalHoleNulNumTy` | 11 |
| emit_classify.vl | `coalesceDefaultNullable` | 5 |
| emit_classify.vl | `exactOperandTyOf` | 801 |
| emit_classify.vl | `exprIsClosure` | 325 |
| emit_classify.vl | `exprListRep` | 991 |
| emit_classify.vl | `fieldValueTakesFnTy` | 2 |
| emit_classify.vl | `fnHandsBackTaggedParam` | 9 |
| emit_classify.vl | `fnHandsBackTaggedParam` | 12 |
| emit_classify.vl | `fnSigKeyOf` | 6 |
| emit_classify.vl | `holeNulLitElemTy` | 47 |
| emit_classify.vl | `ifExprRefKind` | 18 |
| emit_classify.vl | `instanceOperandTyOf` | 24 |
| emit_classify.vl | `letHeldTyOf` | 435 |
| emit_classify.vl | `letNamedHeldTy` | 39 |
| emit_classify.vl | `letNamedHeldTy` | 131 |
| emit_classify.vl | `letNulScalarBoxName` | 52 |
| emit_classify.vl | `letStoreHeldTy` | 256 |
| emit_classify.vl | `letWidensToString` | 2 |
| emit_classify.vl | `loopVarElemPinTyOf` | 167 |
| emit_classify.vl | `objLitTaggedFieldRow` | 11 |
| emit_classify.vl | `objLitTaggedFieldRow` | 62 |
| emit_classify.vl | `paramHeldTy` | 16 |
| emit_classify.vl | `readRepOf` | 2589 |
| emit_classify.vl | `readTypeVerdict` | 471 |
| emit_classify.vl | `readTypeVerdict` | 480 |
| emit_classify.vl | `readTypeVerdictGo` | 10 |
| emit_classify.vl | `readTypeVerdictGo` | 14 |
| emit_classify.vl | `structIndexOfObjCtxMemo` | 5 |
| emit_closure_sites.vl | `ifExprValtype` | 17 |
| emit_collect.vl | `arrLitInstElemRows` | 2 |
| emit_elab.vl | `declOpen` | 1 |
| emit_elab.vl | `elabArmSigAt` | 1 |
| emit_elab.vl | `elabCalleeTyOf` | 14 |
| emit_elab.vl | `elabCheckedTyOf` | 734 |
| emit_elab.vl | `elabCheckedTyOf` | 2944 |
| emit_elab.vl | `elabHolderSlotTy` | 1 |
| emit_elab.vl | `elabNodeInstTys` | 218 |
| emit_elab.vl | `elabOutTyVia` | 3 |
| emit_elab.vl | `elabParamTyOf` | 14 |
| emit_elab.vl | `elabRetOf` | 22 |
| emit_elab.vl | `elabRetParamOf` | 23 |
| emit_elab.vl | `elabSigReads` | 24 |
| emit_elab.vl | `elabSigReads` | 41 |
| emit_elab.vl | `litRepTyAt` | 232 |
| emit_elab.vl | `litRepTyIn` | 2634 |
| emit_fn_scans.vl | `fnUnionRetSinkOk` | 6 |
| emit_if_arm_values.vl | `ifJoinIsScalarPrim` | 18 |
| emit_list_rep.vl | `paramString` | 3 |
| emit_lit_atoms.vl | `arrElemInstTyAt` | 116 |
| emit_mono.vl | `monoReadsUnfilledNull` | 1 |
| emit_nullable_rets.vl | `mapAnnShape` | 2 |
| emit_obj_lit_fits.vl | `emptyArrHoleElemSlot` | 35 |
| emit_obj_lit_fits.vl | `nodeTyIsUnionRow` | 1 |
| emit_ref_list_kinds.vl | `emptyArrHoleKind` | 35 |
| emit_rep.vl | `nodeMapTyIx` | 2 |
| emit_rep.vl | `repOfNodeAt` | 301 |
| emit_shape_rows.vl | `arrElemIsClosureArena` | 104 |
| emit_shape_rows.vl | `arrLitArenaElemRow` | 13 |
| emit_shape_rows.vl | `arrLitBoxElemName` | 104 |
| emit_shape_rows.vl | `arrLitElemRender` | 36 |
| emit_shape_rows.vl | `arrLitElemRendersNoMap` | 90 |
| emit_shape_rows.vl | `arrLitMapElemName` | 19 |
| emit_shape_rows.vl | `arrLitNestedElemName` | 231 |
| emit_shape_rows.vl | `arrLitNominalElemTy` | 94 |
| emit_shape_rows.vl | `arrLitNulBoxElem` | 104 |
| emit_shape_rows.vl | `arrLitNulRefElemName` | 245 |
| emit_shape_rows.vl | `arrLitShapeElemName` | 141 |
| emit_sig_tokens.vl | `paramStructIndex` | 9 |
| emit_ty_canon.vl | `holeOperandTyOf` | 409 |
| emit_ty_canon.vl | `nodeTyInOf` | 1038 |
| emit_union_atoms.vl | `annRowOfNode` | 2 |
| emit_union_casts.vl | `asExprIsUnionCast` | 9 |
| emit_union_casts.vl | `asExprNumSrcName` | 3 |
| emit_union_casts.vl | `asExprOperandIsHole` | 9 |
| wasmEmit.vl | `cloArgInstanceMisfits` | 4 |
| wasmEmit.vl | `coalHoleMapReadNullTest` | 12 |
| wasmEmit.vl | `emitCoalesceGo` | 3 |
| wasmEmit.vl | `emitCoalesceGo` | 20 |
| wasmEmit.vl | `litIsPinNever` | 4 |
| wasmEmit.vl | `njBoxHoldsNull` | 15 |
| wasmEmit.vl | `readMayBeNulUnit` | 139 |

## The static counts

Call sites outside comments and definitions: `bindGenWalk` 2 in `emit_mono.vl`, 22 in
`emit_elab.vl` (the line said 12 in the emitter); `monoArgTyName` 6, all in `emit_mono.vl` (the
line said 9).
