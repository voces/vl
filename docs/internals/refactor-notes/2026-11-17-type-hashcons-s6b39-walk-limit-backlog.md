# Type hash-cons stage 6b, tier 2: the walk-limit backlog (lane HASH), 2026-11-17

Tier 2 stops here by coordinator ruling: the scattered remainder is diminishing returns. This is the
backlog, so a later change can pick a site up by itself.

## Where tier 2 ended

- **Converted, file by file:** `emit_elab.vl`, `check_types.vl`, `check_elab_cap.vl`,
  `check_store_rep.vl`, `check_side_rows.vl`, `emit_collect.vl`, `emit_rep.vl`,
  `check_assignable.vl` and `emit_shape_rows.vl` (s6b28–s6b38). The last three were open PRs at
  the time of writing: #8870, #8886 and #8891.
- **Kept as intentional cost bounds:** `tySameAt` and `callBuiltTy` (s6b35).
- **Not attempted:** the call-graph walks `fvaHoleDeclOf`, `fvaRelayValueCalls`,
  `fvaRelayTwinInner` (s6b37) and `holeParamUnreadIn`. They follow a function's returned or
  forwarded values into other functions, which is `callBuiltTy`'s shape. Without their bound they
  need a memo that lives across questions.
- **Parked:** `check_calls.vl`'s ten type, literal and binding walks were converted on the branch
  `walk-limit-check-calls`, with no PR, when the ruling arrived. That branch grades clean:
  - identity sweep: 3,223 / 3,223 programs byte-identical;
  - `regress.vl`: 0 `runs → not-runs`;
  - deep-nesting grid: 240 / 240;
  - self-compile fuel: +0.03%.

  The gate did not finish.

## The backlog: census-reached sites still bounded

These are the s6b21 census's reached rows whose function still has a `walk-limit` hit on master
`a4b5ff113`. Excluded:
- sentinels and mode flags, which the lint skips;
- the two cost bounds;
- `emitListEmptyFitIs`, which is not a limit;
- the rows the three open PRs convert.

"Reach" is the number of the 3,223 census programs in which the bound fired. Every row's effect when
raised was "none" on that population, except `handBackHoleIx`'s, which the census records. The
unreached sites are counted per file in the census note.

| reach | census row | file | function | bound | note |
| ---: | ---: | --- | --- | --- | --- |
| 92 | 307 | emit_anon_fields.vl | `tyHasLitDeep` | `depth <= 0` |  |
| 83 | 27 | check_calls.vl | `calleeSlotOf` | `depth > 8` | converted on the parked branch `walk-limit-check-calls` |
| 74 | 194 | check_relate_core.vl | `constrainEmptyD` | `depth <= 0` |  |
| 43 | 37 | check_demands.vl | `bareBraceDeliver` | `depth <= 0` |  |
| 42 | 139 | check_literals.vl | `recordElemRepArrayLit` | `depth <= 0` |  |
| 42 | 188 | check_rec_rows.vl | `recOwnPendAt` | `depth <= 0` |  |
| 37 | 100 | check_fit_rules.vl | `listCopyAt` | `depth < 0` |  |
| 37 | 254 | check_type_shape.vl | `tyParamsPart` | `depth > 8` |  |
| 35 | 101 | check_fit_rules.vl | `recCopyAt` | `depth < 0` |  |
| 28 | 134 | check_leaf_steps.vl | `noteLitElemCstrs` | `depth <= 0` |  |
| 28 | 563 | tyquery.vl | `tyStoresVoid` | `depth <= 0` |  |
| 27 | 96 | check_fit_rules.vl | `listWidenWalk` | `depth <= 0` |  |
| 25 | 131 | check_leaf_steps.vl | `openRowsAt` | `depth <= 0` |  |
| 18 | 19 | check_calls.vl | `holeParamUnreadIn` | `depth > HOLE_FWD_UNREAD_MAX` | call-graph walk: the cross-question memo item |
| 17 | 198 | check_relate_core.vl | `holeBindAt` | `depth > HOLE_CALL_NODE_MAX` |  |
| 16 | 241 | check_ty_relate.vl | `tyCanHoldMap` | `depth <= 0` |  |
| 16 | 284 | check_write_scan.vl | `cwFnValueDeclOf` | `hops < 8` |  |
| 15 | 202 | check_relate_core.vl | `holeLetReadsOf` | `seen.length > 64` |  |
| 14 | 33 | check_decl_scan.vl | `localNomEscapeAt` | `depth > 8` |  |
| 11 | 121 | check_hand_back.vl | `handBackHoleIx` | `depth > 8` |  |
| 11 | 240 | check_ty_relate.vl | `mapTwinFlatten` | `depth <= 0` |  |
| 10 | 551 | mfr_shadow.vl | `mfrIndexedFns` | `rev.length < 8` |  |
| 10 | 562 | tyquery.vl | `tyMentionsVoid` | `depth <= 0` |  |
| 9 | 98 | check_fit_rules.vl | `listSlotWidens` | `depth <= 0` |  |
| 8 | 21 | check_calls.vl | `holeFieldCopyOf` | `hops < 8` | converted on the parked branch `walk-limit-check-calls` |
| 8 | 200 | check_relate_core.vl | `holeCallNodeTy` | `depth > HOLE_CALL_NODE_MAX` |  |
| 8 | 302 | elab_fn_id.vl | `idSetOf` | `depth > 32` |  |
| 8 | 321 | emit_classify.vl | `exprStoredRepTy` | `depth <= 0` |  |
| 8 | 496 | emit_mono.vl | `monoNoteBindSig` | `hops < 8` |  |
| 7 | 212 | check_relate_core.vl | `fvaHeldHoleFnDiffers` | `depth <= 0` |  |
| 7 | 249 | check_ty_relate.vl | `fvaNestedFnDiffers` | `depth <= 0` |  |
| 7 | 306 | elab_stub.vl | `elabInertFnsAt` | `depth > 8` |  |
| 6 | 36 | check_demands.vl | `pinRowsAddOpenLists` | `depth <= 0` |  |
| 6 | 153 | check_num_lit_state.vl | `lbiTreeReads` | `depth > LBI_TREE_DEPTH` |  |
| 6 | 558 | pin_spell.vl | `monoAnnPinTyAt` | `depth > 64` |  |
| 5 | 567 | tyquery.vl | `tyPeelElems` | `depth <= 0` |  |
| 4 | 17 | check_calls.vl | `checkHandedFns` | `depth > 4` | converted on the parked branch `walk-limit-check-calls` |
| 4 | 144 | check_narrow_flow.vl | `defaultOpenHoles` | `depth <= 0` |  |
| 4 | 448 | emit_mono.vl | `monoTyHoldsGradual` | `depth > 8` |  |
| 4 | 463 | emit_mono.vl | `monoCoerceAliasOfWrittenLet` | `hops < MONO_ALIAS_CHAIN_MAX` |  |
| 4 | 479 | emit_mono.vl | `monoAliasCellRead` | `hops < MONO_ALIAS_CHAIN_MAX` |  |
| 4 | 486 | emit_mono.vl | `monoHoleCopyCallsMisfit` | `rounds < MONO_ALIAS_CHAIN_MAX` |  |
| 4 | 491 | emit_mono.vl | `monoLamValueFe` | `hops < MONO_ALIAS_CHAIN_MAX` |  |
| 4 | 518 | emit_rewrite.vl | `cboxReadGenFn` | `hops < 64` |  |
| 2 | 13 | check_bind_adopt.vl | `cbaHeldInLit` | `depth <= 0` |  |
| 2 | 99 | check_fit_rules.vl | `objShapeAdapterless` | `depth <= 0` |  |
| 2 | 104 | check_fit_rules.vl | `listMemberIn` | `depth <= 0` |  |
| 2 | 141 | check_mint.vl | `mintParamTakesGo` | `depth > 8` |  |
| 2 | 146 | check_narrow_flow.vl | `narListDeliveryErr` | `depth <= 0` |  |
| 2 | 213 | check_relate_core.vl | `bindGenInnerUnionArms` | `depth > 8` |  |
| 2 | 233 | check_subst.vl | `tyFirstVarOwner` | `depth <= 0` |  |
| 2 | 237 | check_top_level.vl | `cstrProbeBefore` | `rounds < 4` |  |
| 2 | 461 | emit_mono.vl | `monoIfBindingWalk` | `hops < MONO_ALIAS_CHAIN_MAX` |  |
| 2 | 472 | emit_mono.vl | `monoFlowNoteInertIn` | `depth > 8` |  |
| 1 | 31 | check_covar_pins.vl | `rcwTvCount` | `depth > 12` |  |
| 1 | 35 | check_demands.vl | `holeKidMapDemands` | `depth <= 0` |  |
| 1 | 171 | check_poly_growth.vl | `pgrCollect` | `depth <= 0` |  |
| 1 | 175 | check_program.vl | `recWidenWalk` | `depth <= 0` |  |
| 1 | 207 | check_relate_core.vl | `holeSlotCallRetsDeep` | `depth > 8` |  |
| 1 | 210 | check_relate_core.vl | `holeSlotArgJudge` | `depth > 8` |  |
| 1 | 288 | check_write_scan.vl | `cwSlotWritesInto` | `depth > 8` |  |
| 1 | 510 | emit_query.vl | `tyHasFnDeep` | `depth > 6` |  |
| 1 | 533 | emit_union_atoms.vl | `forceCloMapTypesGo` | `depth <= 0` |  |

Before converting one, check its shape:
- A walk over a type, a literal tree or a binding chain converts as tier 2 did.
- A walk into other functions' bodies is the cross-question memo item.

Grade each conversion as tier 2 did, with the identity sweep, regress, the deep grid, the
scaling-shape test and self-compile fuel.
