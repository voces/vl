# Type hash-cons stage 6b: census of numeric depth, hop and step limits (lane HASH), 2026-11-16

Every comparison in `compiler/*.vl` of a depth, budget, hop, guard, step, round or walk-length counter
with a numeric literal of 3 or more, or a `CAPS` constant (and a countdown `depth <= 0` / `< 1`), on master
`6cd6d0210`. 587 sites in 108 files.

## Method

- **Reached.** A scratch instrumenter (`capinst2.py`) wrapped each site: an `if` limit records when it fires, a
  `while` limit records when the loop stops on its counter. The instrumented compiler built 3,223 programs: the
  identity list (2,827 corpus files) plus the 6b grids (deep, fan-out, D16738-D16826, slot path). A site is
  reached when one program fires it; the count is of programs. The method was checked on a control,
  `module-alias-long-chain-beside-local-shadow.vl`, which fires `calleeSlotOf`'s `depth > 8`.
- **Moves an answer.** A second scratch compiler raised every site at once (literal bounds ×8, countdowns to -48),
  skipping mode flags and sentinel exits. Its builds were compared byte for byte with the same tree unraised;
  20 programs moved, and a bisection by file and then by site attributed them (table below).
- **Tags.** `mode-flag`: a bound over 1000 that selects a code path. `sentinel`: the counter is assigned its own
  bound to end the loop, so a hit is a normal exit. `intentional-1`: a countdown also called with 1 on purpose.

## Summary

| | sites | reached |
| --- | --- | --- |
| limit | 558 | 119 |
| sentinel | 20 | 8 |
| mode-flag | 8 | 1 |
| intentional-1 | 1 | 1 |
| **all** | **587** | **129** |

Raising every limit at once moved 20 of 3,223 programs, attributed to nine sites:

- **Load-bearing termination (7 sites).** Countdowns and `depth > 8` checks in `check_types.vl`, `tyquery.vl`
  and `check_leaf_steps.vl` are what stop a walk over a recursive type. 48 more levels makes
  `recursive-tree.vl`, `nullable-recursive-call-narrow-canary.vl` and three other recursive-type fixtures hang:
  the walks re-enter the recursion with no guard. Each must take a path or visited set first. The limit then
  goes, and the answer must not move.
- **Not a limit (1 site).** `emitListEmptyFitIs` (`wasmEmit.vl`, `depth < 1`): its `depth` is no counter but
  `listDisjointDepth`'s answer, the list depth at which the receiver's and the tested type's elements cannot
  meet, or -1; `< 1` means "not that shape". The census's countdown match read it as a budget, and rewriting
  it to `< -48` sent every list `is` down the empty-fit path, so two fixtures became emit rejects. Traced
  2026-11-16; no defect. `walk-limit` fires on a countdown floor only for a parameter of the enclosing
  function since #8793.
- **Code shape only (1 site), priced.** `handBackHoleIx` (`check_hand_back.vl`, `depth > 8`): fan-out of 30 or
  more builds other bytes with the same output. Left as it is (coordinator ruling, 2026-11-16).
- Six fan-out alias cells move only when limits in several files rise together (`alias_*_n030`+, other bytes,
  same output), and `list-element-narrowing-callback-and-loop-runs.vl` likewise. Not attributed to one site.

No reached site turned a refused program into a running one when raised. The capability gap found this way,
`cwSlotPath`'s 16 (s6b19, #8721), was converted before the census; the census tree contains that fix.

## Order of conversion

1. The seven load-bearing sites: each walk takes a path or visited set (the s6b rule: a revisit is a cycle and
   keeps the exhausted answer), then its limit goes. Graded by the five fixtures that hang when raised, plus
   identity and the deep grid.
2. `emitListEmptyFitIs`: traced, not a limit (above).
3. The other reached limits (table): converted with a witness from the grid that reaches them.
4. The unreached limits: cleanup, converted in file batches under the identity sweep.

## Reached sites

Ordered by effect, then by programs reaching them.

| # | file:line | function | bound | kind | programs | effect when raised | tag |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 132 | check_leaf_steps.vl:509 | `recOpenHolePath` | `depth <= 0` | if | 151 | hang (recursive type) |  |
| 256 | check_types.vl:287 | `tyReachesEmptyHole` | `depth <= 0` | if | 108 | hang (recursive type) |  |
| 568 | tyquery.vl:1742 | `tyObjFieldIsLitUnion` | `depth <= 0` | if | 106 | hang (recursive type) |  |
| 257 | check_types.vl:317 | `tyReachesUnion` | `depth <= 0` | if | 96 | hang (recursive type) |  |
| 569 | tyquery.vl:2032 | `tyTvsAmong` | `depth > 8` | if | 92 | hang (recursive type) |  |
| 267 | check_types.vl:3476 | `tyMentionsErr` | `depth <= 0` | if | 77 | hang (recursive type) |  |
| 269 | check_types.vl:3838 | `tyHasRepHoleAt` | `depth > 8` | if | 58 | hang (recursive type) |  |
| 121 | check_hand_back.vl:71 | `handBackHoleIx` | `depth > 8` | if | 11 | fan-out ≥30 builds other bytes (output same) |  |
| 577 | wasmEmit.vl:4992 | `emitListEmptyFitIs` | `depth < 1` | if | 2 | not a limit: a computed depth (traced) |  |
| 570 | tyquery.vl:2155 | `tyHasTyVarGo` | `depth > 19988` | if | 3181 | none | mode-flag |
| 351 | emit_elab.vl:5040 | `elabMintCalleeIn` | `hops < 16` | while | 825 | none | sentinel |
| 408 | emit_elab.vl:18524 | `elabBoxedUnionsInto` | `depth <= 0` | if | 447 | none |  |
| 76 | check_fit_rules.vl:4081 | `recAsgFnWidenedTy` | `hops < 16` | while | 372 | none | sentinel |
| 409 | emit_elab.vl:18611 | `elabUnionArmsInto` | `depth <= 0` | if | 358 | none | intentional-1 |
| 265 | check_types.vl:3270 | `tyHasHoleAt` | `depth > 8` | if | 223 | none |  |
| 41 | check_elab_cap.vl:942 | `elabTyClosedOwn` | `depth > 16` | if | 213 | none |  |
| 225 | check_side_rows.vl:114 | `notePendingNulList` | `depth > 4` | if | 212 | none |  |
| 229 | check_store_rep.vl:435 | `storeLitHeldAt` | `depth <= 0` | if | 197 | none |  |
| 205 | check_relate_core.vl:7116 | `holeSlotPlainRead` | `hops < 16` | while | 179 | none | sentinel |
| 330 | emit_collect.vl:5848 | `objFieldHoldsUnionBox` | `depth > 4` | if | 178 | none |  |
| 45 | check_elab_cap.vl:4075 | `fnTagPlaceRep` | `hops < 16` | while | 169 | none | sentinel |
| 515 | emit_rep.vl:4183 | `repNeverCanon` | `depth > 8` | if | 154 | none |  |
| 8 | check_assignable.vl:4390 | `fvaValueRowWalk` | `depth <= 0` | if | 150 | none |  |
| 332 | emit_collect.vl:6439 | `anonHolderAwaitsElemRow` | `depth > 8` | if | 116 | none |  |
| 329 | emit_collect.vl:4892 | `forceNestedCloSigRepsOfTy` | `depth > 6` | if | 94 | none |  |
| 307 | emit_anon_fields.vl:549 | `tyHasLitDeep` | `depth <= 0` | if | 92 | none |  |
| 335 | emit_collect.vl:8205 | `collectTyReachRegister` | `depth <= 0` | if | 87 | none |  |
| 27 | check_calls.vl:4938 | `calleeSlotOf` | `depth > 8` | if | 83 | none |  |
| 258 | check_types.vl:782 | `tyHasNullHole` | `depth <= 0` | if | 80 | none |  |
| 523 | emit_shape_rows.vl:2009 | `nestedNulRefElemNominalAt` | `depth > 8` | if | 75 | none |  |
| 194 | check_relate_core.vl:825 | `constrainEmptyD` | `depth <= 0` | if | 74 | none |  |
| 333 | emit_collect.vl:6793 | `internArmFieldShapeTy` | `depth > 8` | if | 57 | none |  |
| 109 | check_fn_tag.vl:2734 | `ftWrittenNamedSource` | `hops < 8` | while | 50 | none | sentinel |
| 37 | check_demands.vl:3754 | `bareBraceDeliver` | `depth <= 0` | if | 43 | none |  |
| 139 | check_literals.vl:157 | `recordElemRepArrayLit` | `depth <= 0` | if | 42 | none |  |
| 188 | check_rec_rows.vl:237 | `recOwnPendAt` | `depth <= 0` | if | 42 | none |  |
| 226 | check_store_rep.vl:108 | `callBuiltTy` | `depth <= 0` | if | 39 | none |  |
| 389 | emit_elab.vl:14862 | `elabTyFnFree` | `depth > 8` | if | 39 | none |  |
| 100 | check_fit_rules.vl:8600 | `listCopyAt` | `depth < 0` | if | 37 | none |  |
| 254 | check_type_shape.vl:374 | `tyParamsPart` | `depth > 8` | if | 37 | none |  |
| 101 | check_fit_rules.vl:8661 | `recCopyAt` | `depth < 0` | if | 35 | none |  |
| 134 | check_leaf_steps.vl:1278 | `noteLitElemCstrs` | `depth <= 0` | if | 28 | none |  |
| 414 | emit_elab.vl:19053 | `elabLitBindingFact` | `steps.length < 8` | while | 28 | none |  |
| 563 | tyquery.vl:698 | `tyStoresVoid` | `depth <= 0` | if | 28 | none |  |
| 96 | check_fit_rules.vl:6924 | `listWidenWalk` | `depth <= 0` | if | 27 | none |  |
| 383 | emit_elab.vl:12610 | `elabSetRepTy` | `depth <= 0` | if | 27 | none |  |
| 131 | check_leaf_steps.vl:485 | `openRowsAt` | `depth <= 0` | if | 25 | none |  |
| 393 | emit_elab.vl:15413 | `elabSlotClimb` | `path.length >= 8` | if | 25 | none |  |
| 34 | check_decl_scan.vl:1489 | `nodeTyIsUnionAlias` | `guard < 8` | while | 24 | none | sentinel |
| 392 | emit_elab.vl:15242 | `elabSlotReadDeliveries` | `path.length >= 8` | if | 23 | none |  |
| 4 | check_assignable.vl:1049 | `genFnValueCstrsAt` | `depth > 8` | if | 21 | none |  |
| 451 | emit_mono.vl:5409 | `monoAnonRowListTy` | `depth > 0` | while | 21 | none | sentinel |
| 19 | check_calls.vl:3229 | `holeParamUnreadIn` | `depth > HOLE_FWD_UNREAD_MAX` | if | 18 | none |  |
| 433 | emit_elab.vl:22685 | `eplRebuild` | `depth > 8` | if | 18 | none |  |
| 198 | check_relate_core.vl:5340 | `holeBindAt` | `depth > HOLE_CALL_NODE_MAX` | if | 17 | none |  |
| 241 | check_ty_relate.vl:296 | `tyCanHoldMap` | `depth <= 0` | if | 16 | none |  |
| 284 | check_write_scan.vl:1356 | `cwFnValueDeclOf` | `hops < 8` | while | 16 | none |  |
| 358 | emit_elab.vl:6938 | `elabResMayHoldAt` | `depth <= 0` | if | 16 | none |  |
| 365 | emit_elab.vl:8520 | `elabRetCallRecord` | `depth <= 0` | if | 16 | none |  |
| 525 | emit_shape_rows.vl:2320 | `tyMentionsLitOrObj` | `depth > 6` | if | 16 | none |  |
| 202 | check_relate_core.vl:6723 | `holeLetReadsOf` | `seen.length > 64` | if | 15 | none |  |
| 266 | check_types.vl:3420 | `tyMentionsTyVarNamed` | `depth <= 0` | if | 15 | none |  |
| 33 | check_decl_scan.vl:1410 | `localNomEscapeAt` | `depth > 8` | if | 14 | none |  |
| 240 | check_ty_relate.vl:212 | `mapTwinFlatten` | `depth <= 0` | if | 11 | none |  |
| 337 | emit_collect.vl:8490 | `collectTyReachCloSigsGo` | `depth <= 0` | if | 10 | none |  |
| 551 | mfr_shadow.vl:188 | `mfrIndexedFns` | `rev.length < 8` | while | 10 | none |  |
| 562 | tyquery.vl:675 | `tyMentionsVoid` | `depth <= 0` | if | 10 | none |  |
| 98 | check_fit_rules.vl:7312 | `listSlotWidens` | `depth <= 0` | if | 9 | none |  |
| 421 | emit_elab.vl:20048 | `elabValueInstUp` | `depth > ELAB_VALUE_INST_UP_MAX` | if | 9 | none |  |
| 21 | check_calls.vl:3758 | `holeFieldCopyOf` | `hops < 8` | while | 8 | none |  |
| 50 | check_elab_cap.vl:5196 | `fnTagParamCopyOf` | `hops < 8` | while | 8 | none |  |
| 54 | check_elab_cap.vl:5625 | `elabParamCopyOf` | `hops < 8` | while | 8 | none |  |
| 200 | check_relate_core.vl:5932 | `holeCallNodeTy` | `depth > HOLE_CALL_NODE_MAX` | if | 8 | none |  |
| 302 | elab_fn_id.vl:134 | `idSetOf` | `depth > 32` | if | 8 | none |  |
| 321 | emit_classify.vl:12012 | `exprStoredRepTy` | `depth <= 0` | if | 8 | none |  |
| 349 | emit_elab.vl:3909 | `elabDeliverParams` | `depth > ELAB_DELIVER_CALL_MAX` | if | 8 | none |  |
| 356 | emit_elab.vl:5932 | `elabAliasReadsOk` | `depth <= 0` | if | 8 | none |  |
| 367 | emit_elab.vl:8576 | `elabRetHolderCallGo` | `depth <= 0` | if | 8 | none |  |
| 381 | emit_elab.vl:11532 | `elabLeafParamIx` | `depth <= 0` | if | 8 | none |  |
| 496 | emit_mono.vl:24798 | `monoNoteBindSig` | `hops < 8` | while | 8 | none |  |
| 212 | check_relate_core.vl:9286 | `fvaHeldHoleFnDiffers` | `depth <= 0` | if | 7 | none |  |
| 249 | check_ty_relate.vl:1737 | `fvaNestedFnDiffers` | `depth <= 0` | if | 7 | none |  |
| 306 | elab_stub.vl:124 | `elabInertFnsAt` | `depth > 8` | if | 7 | none |  |
| 36 | check_demands.vl:2229 | `pinRowsAddOpenLists` | `depth <= 0` | if | 6 | none |  |
| 153 | check_num_lit_state.vl:1446 | `lbiTreeReads` | `depth > LBI_TREE_DEPTH` | if | 6 | none |  |
| 558 | pin_spell.vl:454 | `monoAnnPinTyAt` | `depth > 64` | if | 6 | none |  |
| 260 | check_types.vl:1210 | `tyTsGo` | `depth > 64` | if | 5 | none |  |
| 402 | emit_elab.vl:16998 | `elabRetSlotOn` | `path.length >= 8` | if | 5 | none |  |
| 423 | emit_elab.vl:20137 | `elabValueInstRoot` | `steps < 16` | while | 5 | none |  |
| 424 | emit_elab.vl:20371 | `elabFnIdsIn` | `depth > 16` | if | 5 | none |  |
| 567 | tyquery.vl:1718 | `tyPeelElems` | `depth <= 0` | if | 5 | none |  |
| 17 | check_calls.vl:1387 | `checkHandedFns` | `depth > 4` | if | 4 | none |  |
| 144 | check_narrow_flow.vl:1248 | `defaultOpenHoles` | `depth <= 0` | if | 4 | none |  |
| 270 | check_types.vl:4149 | `tySameAt` | `depth <= 0` | if | 4 | none |  |
| 385 | emit_elab.vl:13509 | `elabHeldClosedTyAt` | `depth > 8` | if | 4 | none |  |
| 448 | emit_mono.vl:4379 | `monoTyHoldsGradual` | `depth > 8` | if | 4 | none |  |
| 463 | emit_mono.vl:11505 | `monoCoerceAliasOfWrittenLet` | `hops < MONO_ALIAS_CHAIN_MAX` | while | 4 | none |  |
| 479 | emit_mono.vl:16922 | `monoAliasCellRead` | `hops < MONO_ALIAS_CHAIN_MAX` | while | 4 | none |  |
| 486 | emit_mono.vl:19840 | `monoHoleCopyCallsMisfit` | `rounds < MONO_ALIAS_CHAIN_MAX` | while | 4 | none |  |
| 491 | emit_mono.vl:22668 | `monoLamValueFe` | `hops < MONO_ALIAS_CHAIN_MAX` | while | 4 | none |  |
| 518 | emit_rewrite.vl:4139 | `cboxReadGenFn` | `hops < 64` | while | 4 | none |  |
| 13 | check_bind_adopt.vl:1135 | `cbaHeldInLit` | `depth <= 0` | if | 2 | none |  |
| 99 | check_fit_rules.vl:7396 | `objShapeAdapterless` | `depth <= 0` | if | 2 | none |  |
| 104 | check_fit_rules.vl:9816 | `listMemberIn` | `depth <= 0` | if | 2 | none |  |
| 141 | check_mint.vl:394 | `mintParamTakesGo` | `depth > 8` | if | 2 | none |  |
| 146 | check_narrow_flow.vl:3264 | `narListDeliveryErr` | `depth <= 0` | if | 2 | none |  |
| 213 | check_relate_core.vl:10421 | `bindGenInnerUnionArms` | `depth > 8` | if | 2 | none |  |
| 233 | check_subst.vl:623 | `tyFirstVarOwner` | `depth <= 0` | if | 2 | none |  |
| 237 | check_top_level.vl:337 | `cstrProbeBefore` | `rounds < 4` | while | 2 | none |  |
| 350 | emit_elab.vl:4200 | `elabReachHandsSet` | `depth > 8` | if | 2 | none |  |
| 427 | emit_elab.vl:20986 | `elabUnionArmBinds` | `depth > 16` | if | 2 | none |  |
| 461 | emit_mono.vl:11166 | `monoIfBindingWalk` | `hops < MONO_ALIAS_CHAIN_MAX` | while | 2 | none |  |
| 472 | emit_mono.vl:13963 | `monoFlowNoteInertIn` | `depth > 8` | if | 2 | none |  |
| 522 | emit_shape_rows.vl:1878 | `tyMentionsFunc` | `depth > 12` | if | 2 | none |  |
| 31 | check_covar_pins.vl:149 | `rcwTvCount` | `depth > 12` | if | 1 | none |  |
| 35 | check_demands.vl:1335 | `holeKidMapDemands` | `depth <= 0` | if | 1 | none |  |
| 133 | check_leaf_steps.vl:1049 | `pushElemReadFact` | `depth > 0` | while | 1 | none | sentinel |
| 171 | check_poly_growth.vl:116 | `pgrCollect` | `depth <= 0` | if | 1 | none |  |
| 175 | check_program.vl:3681 | `recWidenWalk` | `depth <= 0` | if | 1 | none |  |
| 207 | check_relate_core.vl:7309 | `holeSlotCallRetsDeep` | `depth > 8` | if | 1 | none |  |
| 210 | check_relate_core.vl:7585 | `holeSlotArgJudge` | `depth > 8` | if | 1 | none |  |
| 264 | check_types.vl:3149 | `tyContainsList` | `depth <= 0` | if | 1 | none |  |
| 288 | check_write_scan.vl:2183 | `cwSlotWritesInto` | `depth > 8` | if | 1 | none |  |
| 323 | emit_collect.vl:1213 | `alcCommitAnn` | `depth > 4` | if | 1 | none |  |
| 334 | emit_collect.vl:6810 | `internArmShapeOfTy` | `depth > 8` | if | 1 | none |  |
| 336 | emit_collect.vl:8322 | `collectTyMembersReach` | `depth < 0` | if | 1 | none |  |
| 339 | emit_elab.vl:681 | `elabCanonStr` | `depth <= 0` | if | 1 | none |  |
| 510 | emit_query.vl:910 | `tyHasFnDeep` | `depth > 6` | if | 1 | none |  |
| 533 | emit_union_atoms.vl:2006 | `forceCloMapTypesGo` | `depth <= 0` | if | 1 | none |  |

## Unreached sites, by file

No program of the 3,223 fires these. Counted per file; the full list regenerates with `capinst2.py`.

| file | sites |
| --- | --- |
| emit_elab.vl | 72 |
| emit_mono.vl | 51 |
| check_fit_rules.vl | 43 |
| check_relate_core.vl | 15 |
| wasmEmit.vl | 11 |
| check_elab_cap.vl | 10 |
| emit_classify.vl | 9 |
| check_calls.vl | 8 |
| check_num_lit_state.vl | 8 |
| check_ty_relate.vl | 8 |
| check_types.vl | 8 |
| check_write_scan.vl | 8 |
| emit_collect.vl | 8 |
| lint.vl | 8 |
| check_fn_tag.vl | 7 |
| check_width_slot.vl | 7 |
| check_assignable.vl | 6 |
| check_program.vl | 6 |
| driver.vl | 6 |
| check_rec_fresh.vl | 5 |
| check_scopes.vl | 5 |
| emit_union_atoms.vl | 5 |
| tyquery.vl | 5 |
| check_getter_effects.vl | 4 |
| check_narrow_flow.vl | 4 |
| check_operators.vl | 4 |
| check_subst.vl | 4 |
| emit_eq_rows.vl | 4 |
| emit_rep.vl | 4 |
| parser.vl | 4 |
| value_reach.vl | 4 |
| check_lam_chain.vl | 3 |
| check_leaf_steps.vl | 3 |
| check_record_writes.vl | 3 |
| check_store_rep.vl | 3 |
| check_ty_rep.vl | 3 |
| elab_fn_id.vl | 3 |
| emit_capture_frames.vl | 3 |
| emit_shape_rows.vl | 3 |
| fn_ret_shadow.vl | 3 |
| ast.vl | 2 |
| check_bind_adopt.vl | 2 |
| check_bind_rows.vl | 2 |
| check_discarded.vl | 2 |
| check_generic_args.vl | 2 |
| check_hole_pins.vl | 2 |
| check_num_lits.vl | 2 |
| check_pins.vl | 2 |
| check_range_var.vl | 2 |
| check_rec_rows.vl | 2 |
| check_set_bind.vl | 2 |
| check_top_level.vl | 2 |
| emit_field_codes.vl | 2 |
| emit_mv_slots.vl | 2 |
| emit_query.vl | 2 |
| emit_rewrite.vl | 2 |
| emit_ty_canon.vl | 2 |
| opt_inline_scan.vl | 2 |
| symbols.vl | 2 |
| check_asg_rows.vl | 1 |
| check_core_state.vl | 1 |
| check_covar_pins.vl | 1 |
| check_covar_write.vl | 1 |
| check_demands.vl | 1 |
| check_emit_queries.vl | 1 |
| check_expected.vl | 1 |
| check_hand_back.vl | 1 |
| check_hole_links.vl | 1 |
| check_hole_rows.vl | 1 |
| check_list_origin.vl | 1 |
| check_list_union.vl | 1 |
| check_literals.vl | 1 |
| check_mint.vl | 1 |
| check_mismatch_notes.vl | 1 |
| check_nj_join.vl | 1 |
| check_num_adopt.vl | 1 |
| check_obj_shape.vl | 1 |
| check_overload.vl | 1 |
| check_query.vl | 1 |
| check_rec_adopt_rows.vl | 1 |
| check_tp_join.vl | 1 |
| check_type_shape.vl | 1 |
| check_unconsumed.vl | 1 |
| check_user_spelling.vl | 1 |
| check_width.vl | 1 |
| cli.vl | 1 |
| const_lets.vl | 1 |
| emit_atom_kinds.vl | 1 |
| emit_fn_ret_kinds.vl | 1 |
| emit_fn_scans.vl | 1 |
| emit_join_records.vl | 1 |
| emit_lit_atoms.vl | 1 |
| emit_map_value_slots.vl | 1 |
| emit_obj_lit_fits.vl | 1 |
| emit_sections.vl | 1 |
| emit_state.vl | 1 |
| emit_union_tykey_text.vl | 1 |
| emit_value_sites.vl | 1 |
| emit_variant_sig.vl | 1 |
| extents.vl | 1 |
| format.vl | 1 |

## A lint rule to keep new limits out

The census pattern is mechanical, so a `walk-limit` rule (`compiler/lint.vl`) is proposed:
- **Flags:** in an `if` or `while` condition, a comparison of a counter named `depth*`, `budget*`, `hops`,
  `guard`, `steps`, `rounds`, `tries` or `<walk>.length` with a numeric literal of 3 or more, or a `CAPS` constant.
- **Ratchet:** a new budget baseline beside `scripts/scan-budget-baseline.json`, which `arena-scan-outside-pass` uses. The
  count may only fall, and a PR converting a limit lowers the baseline in the same change.
- **False hits seen in the census:** mode flags (8 sites, a bound over 1000) and sentinel exits (20 sites, the
  counter assigned its own bound). The rule can skip both shapes mechanically; what remains is a limit.
- **Not seen by it:** a countdown whose bound is the literal at its call site (`f(x, 8)` with `depth <= 0`). The
  rule flags the `depth <= 0` test; the bound lives at the callers.
