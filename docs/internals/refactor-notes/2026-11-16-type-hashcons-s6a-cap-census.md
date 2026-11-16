# Type hash-cons stage 6a: which depth caps fire, and whether their answers depend on the depth (lane H), 2026-11-16

Stage 6 removes the `depth` parameter from the walkers. The design note's rule: a cap that never fires
deletes byte-identically; a cap that fires is a mover, filed with its witness, usually a clause-1
bug. This census is the measurement 6b works from. It is docs only.

## Method

A scratch instrumenter, never committed, rewrote every depth comparison inside an `if` condition of a
function with an `i32` parameter named `depth*` or `budget*`. A comparison `C` became
`(C && capHit(id))`: the count rises only when that term is evaluated and true, and every boolean
is unchanged. The counts went out through the identity shadow's rows (`$VL_ID_SHADOW`).

- **Control:** `types/self-recursive-map-arm-declares.vl` fires two caps and builds a byte-identical
  module.
- **Seed:** built from master 350eab14e in a scratch worktree, kept in the session scratchpad, then
  removed.
- **Population:** 19,939 files (all of `tests/cases` outside `modules/`, `distilled/cells`,
  `distilled/named`), plus master's `compiler/entry.vl` built from the main checkout.

**Classes.** Each site is classed by which way its depth runs, read from the function body (`depth - k`
or `depth + k`), and by the comparison:

| class | sites | fire |
|---|---:|---:|
| exhaustion: counting down to `<= 0`, `< 1` or `== 0`, or counting up past a limit | 317 | 79 |
| top-level test: counting up, `== 0` or `> 0` (for example `cboxFrameReset`) | 18 | 17 |
| depth only passed through: no arithmetic on it in the body | 35 | 10 |
| "not yet exhausted" (`> 0` while counting down) | 4 | 3 |
| other | 6 | 5 |

There are 380 sites in 629 functions that take a depth parameter. The other 284 functions only pass it
on. The class column is mechanical; `fnTagHasSplitFieldIn` below shows a "cap" that is really a scope.

## Does a firing cap's answer depend on its depth?

A second scratch seed deepened every exhaustion cap: count-up limits times four, count-down limits 48
levels further. It was compared with master's fixpoint seed on the 1,418 files where an exhaustion cap
fired (`compiler/entry.vl` is not in this comparison):

| reading | files |
|---|---:|
| byte-identical | 1,409 |
| deeper times out at 150 s | 6 |
| deeper builds an invalid module | 3 |

- **The six timeouts** are all recursive types: `soundness/recursive-binary-tree-sound.vl`,
  `structs/nullable-recursive-call-narrow-canary.vl`, `structs/recursive-nullable-field-equality.vl`,
  `types/recursive-tree.vl`, `unions/narrowed-array-arm-index-binding.vl` and
  `unions/struct-holding-self-recursive-arm.vl`. `tyMayHoldFn`, `tyHasInferHole` and
  `tyReachesClosure` fire in all six. Those caps are how the walk terminates: 6b replaces them with a
  visited set or a nominal cut, and cannot simply delete them.
- **The three invalid modules** all go through one site, `fnTagHasSplitFieldIn` (`check_elab_cap.vl`).
  Its `depth` is D15805's search scope by design: 1 for a returned literal, whose function's result row
  holds the nested records, and 8 for a bound one. Deepening it changed the design, not a budget.
  - Probing the bound scope at the depths D15805 did not test found **D16730**. Nesting four to six
    levels is check-clean and builds an invalid module.
  - At seven levels it is D16731, an emit reject. At eight and deeper it is D16732, a check reject.
  - The cut at four is not this cap, whose limit is 8.

So 1,409 of the 1,418 files keep their output when the caps run deeper. The answers there do not depend
on where the walk stopped. The population is files where an exhaustion cap fired.

## The 79 exhaustion caps that fire

"Programs" counts files in the census population. "L2" means the cap also fires while building
`compiler/entry.vl`. The witness is the smallest file that fires it. "Deeper" gives the cap's reading in
the ablation above.

| site | guard | dir | programs | hits | L2 | smallest witness | deeper cap |
|---|---|---|---:|---:|---|---|---|
| `emit_anon_fields.vl:550` `tyHasLitDeep` | `depth <= 0` | down | 362 | 461 |  | `distilled/named/d2781_cell_hole_parameter.vl` | byte-identical |
| `emit_shape_rows.vl:2054` `nestedNulRefElemNominalAt` | `depth > 8` | up | 319 | 1957 | yes | `distilled/named/d15203_run_uncalled_list_of_lists.vl` | fires where deeper times out |
| `check_elab_cap.vl:3898` `fnTagHasSplitFieldIn` | `depth <= 0` | down | 179 | 702 |  | `distilled/named/d15220_cell_inline.vl` | a scope, not a budget (D16730) |
| `tyquery.vl:1716` `tyObjFieldIsLitUnion` | `depth <= 0` | down | 171 | 13522 |  | `distilled/named/fz_a_is.vl` | fires where deeper times out |
| `check_fn_tag.vl:4552` `ftHoldKind` | `depth <= 0` | down | 149 | 4155 |  | `distilled/named/d15270_list_field.vl` | byte-identical |
| `check_types.vl:695` `tyMayHoldFn` | `depth > 8` | up | 141 | 52937 | yes | `distilled/named/cyclic_mapval_selfmap.vl` | fires where deeper times out |
| `check_types.vl:3164` `tyHasInferHole` | `depth > 8` | up | 133 | 297185 | yes | `distilled/named/cyclic_mapval_selfmap.vl` | fires where deeper times out |
| `check_types.vl:3816` `tyReachesClosure` | `depth <= 0` | down | 133 | 59482 | yes | `distilled/named/cyclic_mapval_selfmap.vl` | fires where deeper times out |
| `tyquery.vl:2006` `tyTvsAmong` | `depth > 8` | up | 103 | 91945 | yes | `distilled/named/cyclic_mapval_selfmap.vl` | fires where deeper times out |
| `check_types.vl:3419` `tyMentionsErr` | `depth <= 0` | down | 91 | 12287 |  | `distilled/named/cyclic_mapval_selfmap.vl` | fires where deeper times out |
| `emit_elab.vl:12593` `elabSetRepTy` | `depth <= 0` | down | 79 | 204 |  | `distilled/cells/a008575.vl` | byte-identical |
| `tyquery.vl:1563` `tyHoldsNonI32Num` | `depth <= 0` | down | 77 | 20027 | yes | `distilled/named/cyclic_mapval_mutual.vl` | fires where deeper times out |
| `check_types.vl:287` `tyReachesEmptyHole` | `depth <= 0` | down | 76 | 94346 |  | `distilled/named/cyclic_mapval_selfmap.vl` | fires where deeper times out |
| `check_types.vl:317` `tyReachesUnion` | `depth <= 0` | down | 76 | 52568 |  | `distilled/named/cyclic_mapval_selfmap.vl` | fires where deeper times out |
| `emit_collect.vl:4898` `forceNestedCloSigRepsOfTy` | `depth > 6` | up | 64 | 1626 |  | `generics/recursive-generic-alias-array.vl` | fires where deeper times out |
| `tyquery.vl:697` `tyStoresVoid` | `depth <= 0` | down | 61 | 9620 |  | `unions/error-recursive-alias-list-into-list.vl` | fires where deeper times out |
| `check_num_lit_state.vl:1446` `lbiTreeReads` | `depth > LBI_TREE_DEPTH` | up | 58 | 3014 | yes | `intrinsics/error-redefine-intrinsic-binding-with-import.vl` | byte-identical |
| `check_elab_cap.vl:3800` `fnTagHoldsTy` | `depth <= 0` | down | 45 | 39390 | yes | `distilled/named/d15294_nested_bound.vl` | fires where deeper times out |
| `check_store_rep.vl:108` `callBuiltTy` | `depth <= 0` | down | 39 | 118 | yes | `functions/infer-void-recursion.vl` | byte-identical |
| `check_leaf_steps.vl:500` `recOpenHolePath` | `depth <= 0` | down | 38 | 7115 |  | `distilled/named/cyclic_mapval_mutual.vl` | fires where deeper times out |
| `check_ty_relate.vl:296` `tyCanHoldMap` | `depth <= 0` | down | 36 | 315 |  | `unions/error-recursive-alias-map-store-of-call.vl` | fires where deeper times out |
| `check_types.vl:733` `tyHasNullHole` | `depth <= 0` | down | 27 | 12385 | yes | `generics/recursive-generic-alias-array.vl` | fires where deeper times out |
| `tyquery.vl:1692` `tyPeelElems` | `depth <= 0` | down | 22 | 35 |  | `distilled/named/d341_arr3_i32_eqnull_else_in0.vl` | byte-identical |
| `check_types.vl:3363` `tyMentionsTyVarNamed` | `depth <= 0` | down | 21 | 338 |  | `generics/recursive-generic-alias-array.vl` | byte-identical |
| `check_type_shape.vl:374` `tyParamsPart` | `depth > 8` | up | 17 | 13430 |  | `structs/recursive-record-unfolded-annotation-shares-row.vl` | byte-identical |
| `emit_elab.vl:14866` `elabTyFnFree` | `depth > 8` | up | 14 | 103 |  | `unions/recursive-alias-nested-list-copied-with-map.vl` | byte-identical |
| `elab_stub.vl:124` `elabInertFnsAt` | `depth > 8` | up | 13 | 2488 | yes | `generics/returned-join-long-alias-chain.vl` | byte-identical |
| `emit_collect.vl:5859` `objFieldHoldsUnionBox` | `depth > 4` | up | 12 | 7586 |  | `closures/fn-value-deep-record-result-field.vl` | byte-identical |
| `check_decl_scan.vl:1410` `localNomEscapeAt` | `depth > 8` | up | 9 | 1596 |  | `unions/inferred-return-self-union-nullable.vl` | byte-identical |
| `emit_shape_rows.vl:2365` `tyMentionsLitOrObj` | `depth > 6` | up | 9 | 144 |  | `unions/recursive-alias-nested-list-copied-with-map.vl` | fires where deeper times out |
| `pin_spell.vl:424` `monoAnnPinTyAt` | `depth > 64` | up | 9 | 42 |  | `generics/recursive-local-type-in-generic-fn.vl` | byte-identical |
| `emit_elab.vl:8567` `elabRetHolderCallGo` | `depth <= 0` | down | 8 | 10 |  | `distilled/named/d626_alias2.vl` | byte-identical |
| `check_fit_rules.vl:6625` `listWidenWalk` | `depth <= 0` | down | 7 | 8210 |  | `generics/recursive-generic-alias-cons.vl` | byte-identical |
| `check_types.vl:4078` `tySameAt` | `depth <= 0` | down | 6 | 118 |  | `generics/recursive-generic-union-alias-self-call.vl` | byte-identical |
| `emit_elab.vl:4369` `elabHoleHandBackIx` | `depth > 8` | up | 6 | 44 |  | `generics/fn-result-null-into-generic-nullable.vl` | byte-identical |
| `check_elab_cap.vl:1309` `elabFnLeavesNamed` | `depth > 6` | up | 5 | 800 |  | `structs/recursive-record-unfolded-annotation-shares-row.vl` | byte-identical |
| `check_types.vl:1161` `tyTsGo` | `depth > 64` | up | 5 | 13 |  | `generics/recursive-local-type-in-generic-fn.vl` | byte-identical |
| `emit_elab.vl:667` `elabCanonStr` | `depth <= 0` | down | 5 | 69 |  | `generics/generic-pin-declared-record-list.vl` | byte-identical |
| `check_fit_rules.vl:7008` `listSlotWidens` | `depth <= 0` | down | 4 | 146 |  | `generics/recursive-generic-alias-cons.vl` | byte-identical |
| `check_demands.vl:3755` `bareBraceDeliver` | `depth <= 0` | down | 3 | 126 | yes | `closures/lambda-empty-list-of-deeply-nested-record.vl` | byte-identical |
| `check_subst.vl:613` `tyFirstVarOwner` | `depth <= 0` | down | 3 | 40 |  | `generics/recursive-generic-union-alias-self-call.vl` | byte-identical |
| `emit_elab.vl:6929` `elabResMayHoldAt` | `depth <= 0` | down | 3 | 145 |  | `closures/module-alias-long-chain-beside-local-shadow.vl` | byte-identical |
| `check_calls.vl:4706` `calleeSlotOf` | `depth > 8` | up | 2 | 3 |  | `closures/module-alias-long-chain-beside-local-shadow.vl` | byte-identical |
| `check_elab_cap.vl:1520` `elabFnJoinDeepAt` | `depth > 6` | up | 2 | 384 |  | `lists/list-of-lists-and-function-list-over-diamond-record.vl` | byte-identical |
| `check_fit_rules.vl:7097` `objShapeAdapterless` | `depth <= 0` | down | 2 | 8 |  | `generics/pin-exact-key-nested-set-map.vl` | byte-identical |
| `check_fn_tag.vl:3294` `ftConstSource` | `depth <= 0` | down | 2 | 138 |  | `closures/module-alias-long-chain-beside-local-shadow.vl` | byte-identical |
| `check_mint.vl:394` `mintParamTakesGo` | `depth > 8` | up | 2 | 3 |  | `functions/hole-param-forwarded-only-by-own-recursion.vl` | byte-identical |
| `check_num_lit_state.vl:2067` `lbiConstVal` | `depth > LBI_TREE_DEPTH - LBI_CONST_DEPTH` | up | 2 | 4 | yes | `maps/i32-keyed-alongside-string-keyed.vl` | byte-identical |
| `check_relate_core.vl:5859` `holeCallNodeTy` | `depth > HOLE_CALL_NODE_MAX` | up | 2 | 4 |  | `generics/returned-join-long-alias-chain.vl` | byte-identical |
| `check_types.vl:3100` `tyContainsList` | `depth <= 0` | down | 2 | 7 |  | `generics/recursive-generic-alias-cons.vl` | byte-identical |
| `check_types.vl:4424` `tyMapValIsLitUnion` | `depth <= 0` | down | 2 | 13 |  | `soundness/fresh-map-chain-ten-deep.vl` | byte-identical |
| `emit_elab.vl:11515` `elabLeafParamIx` | `depth <= 0` | down | 2 | 2 |  | `generics/returned-join-long-alias-chain.vl` | byte-identical |
| `emit_elab.vl:20548` `elabUnionArmBinds` | `depth > 16` | up | 2 | 14 |  | `generics/recursive-generic-union-alias-self-call.vl` | byte-identical |
| `emit_field_codes.vl:176` `mvArmSigOfShapeTy` | `depth <= 0` | down | 2 | 60 |  | `soundness/fresh-map-chain-ten-deep.vl` | byte-identical |
| `emit_mv_slots.vl:361` `mvDeepArmOfTy` | `depth <= 0` | down | 2 | 17445 |  | `soundness/fresh-map-chain-ten-deep.vl` | byte-identical |
| `emit_mv_slots.vl:394` `mvDeepDeclOfTy` | `depth <= 0` | down | 2 | 21 |  | `soundness/fresh-map-chain-ten-deep.vl` | byte-identical |
| `emit_shape_rows.vl:1923` `tyMentionsFunc` | `depth > 12` | up | 2 | 2076 |  | `closures/lambda-empty-list-deep-record-result.vl` | byte-identical |
| `tyquery.vl:724` `tyJoinsVoidAt` | `depth <= 0` | down | 2 | 16 |  | `soundness/fresh-map-chain-ten-deep.vl` | byte-identical |
| `check_assignable.vl:3891` `fvaHoleDeclOf` | `depth <= 0` | down | 1 | 1 |  | `closures/hole-lambda-returned-into-binding-of-another-type.vl` | byte-identical |
| `check_covar_pins.vl:149` `rcwTvCount` | `depth > 12` | up | 1 | 16 |  | `generics/recursive-generic-union-alias-self-call.vl` | byte-identical |
| `check_elab_cap.vl:1589` `elabFnSetsWiden` | `depth > 6` | up | 1 | 2 |  | `closures/lambda-empty-list-of-deeply-nested-record.vl` | byte-identical |
| `check_fit_rules.vl:1681` `rcwCovsGo` | `depth > 12` | up | 1 | 1 |  | `unions/nested-array-literal-into-recursive-union.vl` | byte-identical |
| `check_fit_rules.vl:9499` `listMemberIn` | `depth <= 0` | down | 1 | 5 |  | `unions/nested-array-literal-into-recursive-union.vl` | byte-identical |
| `check_leaf_steps.vl:445` `openFit` | `depth <= 0` | down | 1 | 2 |  | `generics/pin-exact-key-nested-set-map.vl` | byte-identical |
| `check_num_adopt.vl:471` `f32TreeBits` | `depth <= 0` | down | 1 | 249 |  | `expressions/long-operator-chain.vl` | byte-identical |
| `check_num_lit_state.vl:1817` `cexTreeShape` | `depth > CEX_DEPTH` | up | 1 | 1550 |  | `expressions/long-operator-chain.vl` | byte-identical |
| `check_program.vl:3678` `recWidenWalk` | `depth <= 0` | down | 1 | 1 |  | `unions/nested-array-literal-into-recursive-union.vl` | byte-identical |
| `check_rec_adopt_rows.vl:164` `recAdMentions` | `depth <= 0` | down | 1 | 12 |  | `soundness/error-covariant-record-field-written.vl` | byte-identical |
| `check_rec_fresh.vl:210` `recFreshOriginDecl` | `depth <= 0` | down | 1 | 1 |  | `distilled/cells/a000719.vl` | byte-identical |
| `check_relate_core.vl:1455` `numLitArithFits` | `depth <= 0` | down | 1 | 3 |  | `soundness/error-covariant-record-field-written.vl` | byte-identical |
| `check_relate_core.vl:11757` `widenLitTyGo` | `depth <= 0` | down | 1 | 26 |  | `unions/deep-is-arm-shadowed-receiver.vl` | byte-identical |
| `check_types.vl:3028` `tyHoldsObj` | `depth <= 0` | down | 1 | 12 |  | `generics/pin-exact-key-nested-set-map.vl` | byte-identical |
| `const_lets.vl:221` `clFixedFnValue` | `depth > 16` | up | 1 | 53 |  | `closures/error-hole-lambda-alias-chain-too-long.vl` | byte-identical |
| `emit_collect.vl:1215` `alcCommitAnn` | `depth > 4` | up | 1 | 11 | yes | `compiler/entry.vl` | byte-identical |
| `emit_collect.vl:6455` `anonHolderAwaitsElemRow` | `depth > 8` | up | 1 | 76 |  | `structs/anon-struct-deep-nesting-interns-linearly.vl` | byte-identical |
| `emit_mono.vl:15947` `monoTyOpenUntagged` | `depth <= 0` | down | 1 | 6 |  | `distilled/named/d15551_nested_list.vl` | byte-identical |
| `emit_query.vl:537` `constFoldExpr` | `budget <= 0` | down | 1 | 66 |  | `expressions/module-const-chain-depth.vl` | byte-identical |
| `emit_query.vl:910` `tyHasFnDeep` | `depth > 6` | up | 1 | 2 |  | `closures/lambda-empty-list-of-deeply-nested-record.vl` | byte-identical |
| `wasmEmit.vl:6526` `atomArmSlots` | `depth == 0` | down | 1 | 15 |  | `unions/two-atom-list-arms-is.vl` | byte-identical |

## The 238 exhaustion caps that never fire

These are 6b's byte-identical deletions. Each still needs its own check that the walk terminates
without it: on a type with no cycle, any walk does; on a cyclic one, the nominal cut or a visited set
has to replace the cap.

- `ast.vl`: `tsFnParamNames`, `tsWritesParamNames`
- `check_assignable.vl`: `listArmIn`, `fnShapeClash`, `tyHoldsNoFn`, `holesOnlyInFns`, `fvaValueIsCallResult`
- `check_bind_adopt.vl`: `cbaParamRepTransparent`, `recRebuiltLeafRow`
- `check_bind_rows.vl`: `fsbOwnerReaches`
- `check_calls.vl`: `holeRecSrcsOf`
- `check_cast_bound.vl`: `castBoundBits`
- `check_covar_pins.vl`: `rcwTvPaths`
- `check_cstr_rows.vl`: `tyHolesOnlyInTopFnSigs`
- `check_demands.vl`: `castOperandSource`
- `check_discarded.vl`: `discChainPure`
- `check_elab_cap.vl`: `elabListLeafIsFn`, `elabSlotRecSetHolds`, `fnArgOnlyFrom`, `fnTagInnerLitsOnly`, `fnTagRepTyIn`, `elabRetRecLeafFns`
- `check_emit_queries.vl`: `holePinReadAt`
- `check_fit_rules.vl`: `recFnBuildsAt`, `recValueWrittenThrough`, `recCopyNarrowsAt`, `recHeldInside`, `recNullWidenedAt`, `recLandingIn`, `recBuildsLit`, `recLitFits`, `recSoleReadOfInit`, `recHandOnMakerOf`, `recBuiltReadTyAt`, `recKeptValueDst`, `recListElemCopies`, `objFieldReachesHoleFor`, `recCopyConvertsAt`, `holeOutsideFn`, `retLitAdoptUnion`, `arrLitFitsList`, `recContainerDeliver`
- `check_fn_decl.vl`: `lamLitResult`
- `check_fn_tag.vl`: `ftWholeRecListLit`, `ftTyVarShaped`, `ftSigCarries`, `ftRecWriteJoins`, `ftReachHandSets`, `ftParamInertIn`, `ftSubsetsNoteIn`, `ftListLeavesOfSet`
- `check_generic_args.vl`: `argCheckedTy`
- `check_hole_links.vl`: `holeCastCalleeDeclOf`
- `check_hole_pins.vl`: `tyParamsOnly`
- `check_leaf_steps.vl`: `viewifyLists`, `holdsHoleFn`
- `check_list_union.vl`: `tpIfArmOf`, `luHasView`, `luHasLit`
- `check_literals.vl`: `litUnionOneBase`
- `check_mismatch_notes.vl`: `litMemberAt`
- `check_narrow_flow.vl`: `tyHoldsOpenMap`, `isTestMemberAnswer`
- `check_nj_join.vl`: `njNumSig`
- `check_null_holes.vl`: `exitFirstOnSpine`
- `check_num_adopt.vl`: `numLitAdoptDeep`
- `check_num_lit_state.vl`: `cexF32Leaves`, `lbiTreeHasRadix`, `lbiLitTree`, `cexEvalAt`, `cexWideDecAt`, `argIsLitOnly`, `cexTreeText`
- `check_num_lits.vl`: `litTreeOps`, `litTreeHasRadix`
- `check_overload.vl`: `ovKindClass`
- `check_program.vl`: `numLitUseAccepts`, `rcwValueWrites`, `rcwCallableWrites`, `recBoxApart`, `recElemWalk`
- `check_range_var.vl`: `rvConstIs`, `rvIntervalAt`
- `check_record_writes.vl`: `rcwSourceSlotTy`, `rcwAllFresh`, `rcwCallSlotFresh`, `rcwExprText`
- `check_redundant_annot.vl`: `inlayHoleDeep`
- `check_relate_core.vl`: `numLitLeafFor`, `gaArgHolds`, `holeBindLitForward`, `holeSlotCallRetsDeep`, `holeSlotRepointSet`, `holeSlotArgJudge`, `holeFnRetSubstAt`, `fvaHeldHoleFnDiffers`, `litLeafFitting`, `nulFoldTiedTyAt`, `storageNormGo`
- `check_store_rep.vl`: `storeRepOf`
- `check_subst.vl`: `tyMentionsOwnVarNamed`, `nestTyHas`, `tyVarsOwnedBy`, `tyVarsOwnSchemeGo`, `tyFuncSchemeDecl`
- `check_subst_fold.vl`: `substLeafIsPrim`
- `check_tp_join.vl`: `tyHolesOwnedBy`
- `check_ty_relate.vl`: `eqStructElemFlatTy`, `xrepListPairAt`, `glistLeafKey`, `listJoinStorageDiffers`, `fieldStorageEq`, `recIntToFloatNested`, `recNumChanges`, `fvaSlotMayDiffer`, `fvaNestedFnDiffers`, `widenScanFinds`
- `check_ty_rep.vl`: `elemStoreClassOf`, `refLeafCount`, `tyPrintUnionArmsInDomain`, `valueUnionFlatten`
- `check_type_shape.vl`: `numKindMask`
- `check_types.vl`: `tyPinsEmptyHoles`, `tyRepVaries`, `tyHoldsRecord`, `tyReachesGo`, `tyHasLitLeaf`, `tyHasMapMember`, `memberTySameAt`
- `check_user_spelling.vl`: `declAnnOfValue`
- `check_write_scan.vl`: `cwLitOwners`
- `driver.vl`: `mintedAnchorTok`, `modVisit`, `modOvHeadOfTs`, `modTsSameShape`
- `elab_fn_id.vl`: `idSetOf`, `idSlotHeldTyIn`, `idParamAliased`
- `emit_base.vl`: `structLitUnionFieldAt`
- `emit_classify.vl`: `captureLoopCopySrcAt`, `fnValuePlain`, `holeLitReadIsAtom`, `holeJoinArmsAllAtom`, `recvCheckedTyOf`, `tyNamesDeclaredParam`, `exprStoredRepTy`
- `emit_collect.vl`: `valueFnSig`, `tyFnSetSig`, `objLitSigCountIn`, `nameInListLit`, `recordShapesOneRow`, `riuFlatMembers`, `tcsrReaches`
- `emit_elab.vl`: `elabStrLitWidenGo`, `elabLitBaseTy`, `elabAliasSource`, `elabReadSeedParam`, `elabAliasReadsOk`, `elabElemRead`, `elabParamRowRoot`, `elabReplaceFnTy`, `elabHeldClosedTyAt`, `elabWrittenBuiltTy`, `elabCallBundleRetAt`, `elabLamParamTyAt`, `elabListHeldValuesInto`, `elabTaggedLeavesInto`, `elabHeldKeepSets`, `elabHeldIdTy`, `elabPathTo`, `litListTyClosed`, `litOpenListTyAt`, `elabArgTyAt`, `elabKeyHeldGenericGo`, `eplPlaceOf`, `eplRebuild`
- `emit_eq_rows.vl`: `eqgStructElemFlat`, `eqgStructElemNeeds`, `eqgRepComparable`
- `emit_field_codes.vl`: `jrSpelledAlike`
- `emit_lit_atoms.vl`: `arrElemInstTyAt`
- `emit_mono.vl`: `monoTyHasFieldRecord`, `monoCallsFnValue`, `monoTyHoldsGradual`, `monoRetReachesClash`, `monoSubtreeNamesIdent`, `monoIdentAtPosIn`, `monoObjDiffersInFnFieldsAt`, `monoValueNamesGenerics`, `monoFirstArmGenName`, `monoFlowCallReads`, `monoFlowCallLeafAt`, `monoFlowElemLeaves`, `monoFlowListGrows`, `monoFlowInert`, `monoHeldValueAt`, `monoValueRetAt`, `monoCallValueTy`, `monoLitHoldsGenericFn`, `monoChoiceArmFlowTy`, `monoArgIsOpenFnChoice`, `monoInertArgFns`, `monoDeliverLitAt`, `monoPlaceRoot`, `monoRetLitElemTy`, `monoLamPinName`, `monoLamPinTyPlain`, `monoSubtreeCallsGeneric`
- `emit_obj_lit_fits.vl`: `tyReachesFuncD`, `objLitFitsRow`
- `emit_query.vl`: `namesFnDecl`
- `emit_rep.vl`: `repBoxesTy`, `valueBoxArmsInto`, `btSoftMembersGo`
- `emit_shape_rows.vl`: `fnSigNamesLit`, `elemTyIsNominalAt`, `fnTagRepAgree`
- `emit_ty_canon.vl`: `pinnedParamTyAt`
- `emit_union_atoms.vl`: `identChainTyMapArmUnion`, `identChainTyBoxedUnion`
- `emit_variant_sig.vl`: `tyHasNumLit`, `softMembersInto`
- `extents.vl`: `extWalk`
- `fn_ret_shadow.vl`: `frsClosesHoles`
- `iface_hash.vl`: `ihTyClass`, `ihBearsStrLit`
- `lint.vl`: `upeScalarOperand`, `bacAstStr`, `vecFloatOf`, `intWidthOf`, `lintIsNumCopy`
- `opt_multivalue.vl`: `scanArmEnd`
- `record_rows.vl`: `trcGo`
- `tyquery.vl`: `tyEqNoneIsMap`, `tyNamesNominal`, `tyIsLitUnionLike`, `unionLeafIsWide`
- `wasmEmit.vl`: `deadNeverAt`

## For 6b

1. Delete a never-firing cap only where the walk cannot meet a cycle, or where a visited set already
   guards it. Each deletion is graded byte-identical over the census population.
2. A firing cap whose deeper reading is byte-identical is replaced by a visited set (or the walk moves
   onto canonical ids, where cycles are cut by name). The deeper ablation is the evidence that the
   answer does not move.
3. The termination caps (those firing in the six timeouts) need a visited set before anything else.
4. `fnTagHasSplitFieldIn`'s `depth` is a parameter of the design, not a cap. It stays until D16730's
   close decides the scope.
