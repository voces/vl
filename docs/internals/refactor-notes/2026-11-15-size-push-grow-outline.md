# A `push` grows through one shared helper per list shape, 2026-11-15

Lane P, the owner's second priority: binary size. The first item of a ranked seed-size profile.

## The profile

Master `518cdc66d`'s fixpoint is 6,887,730 bytes, and code is 92.9% of it. Per-site costs were
read from paired programs, ten sites against none. A list `push` cost 129 bytes per site, and
75–85 of those were the grow path, inlined at every site: the capacity test's arm, the new
capacity (4 when empty, else twice), `array.new_default`, `array.copy` and two `struct.set`. The
seed held 8,418 such blocks. The rest of the ranked list, which later PRs take:

| # | pattern | sites | est. saving |
| --- | --- | ---: | ---: |
| 1 | push's inline grow path (this PR) | 8,418 | ~630–700 KB |
| 2 | map get/set inline around `__map_probe` | ~2,490 | ~200–250 KB |
| 3 | the bounds check's cold trap arm, `drop(array.get arr -1)`, at every indexed read | 20,434 | ~180 KB |
| 4 | the string-literal pool's init: one 35,354-byte function of 4,888 nested `__str_fill__` | 1 | ~25–30 KB |
| 5 | identical function bodies (below) | 78 groups | 10.6 KB |

## The change

`emitPushAppend` keeps the capacity test and the append inline, and the arm that grows calls
`__grow_<row>__(L)`. That is a tail helper (`HELP_LIST_GROW + <row>`) minted on first ask, one
per list wrapper and backing pair, whose body is the old inline block over its parameter. The
grow's arithmetic and the copy are unchanged, so every program computes what it did, through a
call on the cold path.

## Measurements

Base and candidate are fixpoints. CPU is user+sys, the median of 10 warm runs over two
interleaved rounds.

| reading | before | after |
| --- | ---: | ---: |
| seed (merged master `68cf8105`) | 6,891,880 B | 6,365,683 B (**−7.6%**) |
| plumb main: CPU / peak RSS | 3.65 s / 315.7 MB | 3.44 s / 309.3 MB |
| plumb tail: CPU / peak RSS | 2.09 s / 315.6 MB | 2.05 s / 309.1 MB |
| L2 self-compile: CPU / peak RSS | 30.64 s / 4,164 MB | 29.95 s / 4,157 MB |
| push microbench (40M pushes, `vl run`) | 0.327 s | 0.308 s |
| plumb fuel main / tail | 9,057,146,903 / 6,561,304,791 | 9,059,749,587 / 6,563,097,946 (+0.03%) |
| L2 fuel | 86,423,751,880 | 86,231,213,791 (−0.22%) |

A push site goes from 129 to about 72 bytes. The microbench's fast path got faster, not slower,
because the loop body is smaller. Sweep, merged master against the candidate: 23,106 same, 1,751
bytes-only movers, 0 runs lost, 0 new compiler traps, and 4 output movers. The 4 are cells that
already fail validation (D16365's witness and three distilled named cells), and only the offset
inside the validator's message moved. `regress.vl`: no runs lost. `scripts/seed-size-baseline.json`
is lowered to the new size.

## The duplicate bodies, for the lane that takes them

78 groups of byte-identical function bodies in the seed, 10,653 redundant bytes. Some are real
source clones (the six type-list comparers, `elabFnIdsUnion` and `idUnion`, `strListHas` and
`monoStrListHas`). Others are one-line bodies that share their bytes by accident (the ×30 group).

| redundant bytes | copies | functions |
| ---: | ---: | --- |
| 1000 | 3 | `__map_set_7__`, `__map_set_13__`, `__map_set_15__` |
| 830 | 2 | `elabFnIdsUnion@emit_elab.vl:14346`, `idUnion@elab_fn_id.vl:105` |
| 800 | 6 | `tyListSame@check_elab_cap.vl:3044`, `elabTyListSame@emit_elab.vl:8935`, `tysSameList@emit_elab.vl:11766`, `tyListSameAll@emit_elab.vl:12810`, `elabTysSame@emit_elab.vl:20939`, `monoSigsSame@emit_mono.vl:20444` |
| 501 | 2 | `__map_set_11__`, `__map_set_14__` |
| 444 | 3 | `toLess@emit_type_order.vl:799`, `lkLess@link.vl:956`, `fmtNameLess@format.vl:707` |
| 364 | 2 | `rrSameNames@record_rows.vl:300`, `bdsSameTexts@box_dst_shadow.vl:317` |
| 329 | 2 | `elabPathPlus@emit_elab.vl:13713`, `monoPathWith@emit_mono.vl:24133` |
| 301 | 2 | `ihListPush@iface_hash.vl:2672`, `expByAdd@driver.vl:4597` |
| 258 | 3 | `fnTagOpenDecl@check_elab_cap.vl:4454`, `elabFnInstanced@emit_elab.vl:14104`, `fnDeclIsGeneric@check_fn_decl.vl:1656` |
| 236 | 2 | `holeSlotPathSteps@check_relate_core.vl:7133`, `cliPopLast@cli_util.vl:355` |
| 231 | 4 | `nhOpen@tyquery.vl:405`, `nhIsOpenAt@check_null_holes.vl:50`, `tyIsOpenNullHole@check_fit_rules.vl:656`, `tyIsUnfilledNullHole@emit_mono.vl:1490` |
| 227 | 2 | `sidArrPut@symbols.vl:523`, `lpColSet@check_null_holes.vl:157` |
| 218 | 2 | `pbStrPush@ast.vl:4333`, `jwAppend@json_walk.vl:206` |
| 205 | 2 | `elabSnapKey@check_elab_cap.vl:404`, `elabSlotKey@emit_elab.vl:13741` |
| 203 | 2 | `fnTagGetRecv@check_elab_cap.vl:3902`, `mfrChainGetObj@mfr_shadow.vl:462` |
| 187 | 2 | `recordFieldTy@emit_join_records.vl:175`, `rrFieldTyOf@record_rows.vl:313` |
| 187 | 2 | `lkHasPrefix@link.vl:965`, `elHasPrefix@emit_link.vl:596` |
| 170 | 3 | `fnTagMembersWithin@check_elab_cap.vl:4681`, `ftMembersWithin@check_fn_tag.vl:262`, `ftSetWithin@check_fn_tag.vl:2412` |
| 165 | 2 | `fieldNameOf@tyname.vl:456`, `gaeHeadNameOf@tyname.vl:556` |
| 164 | 2 | `i32ListEq@listutil.vl:92`, `monoI32sSame@emit_mono.vl:18997` |
| 156 | 3 | `i32ListAt@listutil.vl:86`, `bdGet@bind.vl:123`, `elAt@emit_link.vl:567` |
| 145 | 30 | `tyNotLitUnionLike@tyquery.vl:1435`, `cwCallRetsNone@check_write_scan.vl:2599`, `pcNotRecorded@check_elab_cap.vl:4810`, `cexNoRoot@check_num_lits.vl:317`, `cexKeepLeaf@check_num_lits.vl:320`, `cexShapeNotTree@check_num_lits.vl:323`, `cexNamesNone@check_num_lits.vl:337`, `cexPosNone@check_num_lits.vl:340`, `cexRetypeLeaf@check_num_lits.vl:464`, `litTreeFloatAdopts@check_num_lits.vl:1282`, `intLitSignless@check_num_lits.vl:1384`, `castTargetNeverNarrows@check_num_lits.vl:1464`, `lbiNotLitTree@check_num_lit_state.vl:1435`, `argNotLitOnly@check_num_lit_state.vl:1997`, `numLitPartOpaque@check_num_adopt.vl:591`, `f32JoinRetypesRunning@check_leaf_steps.vl:597`, `radixLitNoParts@check_leaf_steps.vl:1364`, `rlLateRowsNone@emit_state.vl:1055`, `exprEffectFreeUnclassified@emit_base.vl:1804`, `recListElemNotRecs@check_fit_rules.vl:5586`, `recListElemNoCopy@check_fit_rules.vl:5635`, `notInlineMapSource@check_calls.vl:2156`, `storeWriteBuiltOwn@check_store_rep.vl:279`, `recBoxNoPart@check_program.vl:4015`, `optRecvNotAPlace@emit_atom_kinds.vl:1270`, `exprMapOpNotAnOperand@emit_list_rep.vl:342`, `atomHoldsNoSubUnion@emit_collect.vl:8002`, `nssBoxedProducer@emit_rewrite.vl:1132`, `asgParkNone@wasmEmit.vl:29117`, `passCheckTopLevel@emit_sections.vl:6687` |
| 134 | 2 | `hasNamedArgs@ast.vl:2140`, `monoAnyBakedCallback@emit_mono.vl:7666` |
| 133 | 2 | `capIsBound@emit_base.vl:135`, `siHas@lint.vl:6791` |
| 132 | 2 | `strListHas@listutil.vl:7`, `monoStrListHas@emit_mono.vl:5772` |
| 128 | 2 | `fnTagSetOfTy@check_elab_cap.vl:3128`, `idTodaySetId@emit_id_shadow.vl:57` |
| 122 | 2 | `bigBitLen@emit_bignum.vl:363`, `cxmBitLen@const_exact.vl:147` |
| 120 | 4 | `fnDeclNameAt@ast.vl:2063`, `monoFnDeclName@emit_mono.vl:26715`, `slotFnName@check_width_slot.vl:596`, `expFnDeclName@check_pins.vl:734` |
| 108 | 2 | `rrIsString@record_rows.vl:285`, `tyIsStringPrim@emit_obj_lit_fits.vl:850` |
| 107 | 2 | `fnDeclNameIs@check_elab_cap.vl:4145`, `idDeclNamed@elab_fn_id.vl:645` |
| 107 | 2 | `isIdentNamed@check_call_retire.vl:93`, `elabNamesIdent@emit_elab.vl:12521` |
| 100 | 21 | `litUnionNoBase@check_literals.vl:339`, `aliasMemberNotTransparent@check_alias_transparent.vl:114`, `cexNotLit@check_num_lits.vl:357`, `litTreeNotOne@check_num_lits.vl:1129`, `lbiNoCopy@check_num_lit_state.vl:1472`, `checkerForceNone@check_core_state.vl:708`, `narEveryNone@check_leaf_steps.vl:809`, `valueReadsNoDecl@check_user_spelling.vl:47`, `declHasNoAnnotation@check_user_spelling.vl:60`, `rlOpenRowMintNone@emit_state.vl:1100`, `mvTyMintNone@emit_state.vl:1115`, `arrLitMintNone@emit_state.vl:1119`, `holeLitNotCopied@check_assignable.vl:2835`, `modLoopNoneHere@emit_capture_frames.vl:280`, `coalNotMapRead@check_operators.vl:1109`, `storeRepNone@check_store_rep.vl:178`, `storeSlotKeepsOwnRow@check_store_rep.vl:521`, `memberIsNoLiteralBase@emit_collect.vl:7937`, `lvNoBody@emit_rewrite.vl:548`, `fnIxOfNothing@wasmEmit.vl:12077`, `rcListElemUnboxed@wasmEmit.vl:31082` |
| 99 | 2 | `unRowHasMapArm@emit_union_registry.vl:848`, `unionRowHasMapArm@emit_start_block.vl:609` |
| 98 | 2 | `i32ListHas@listutil.vl:17`, `monoSeenHas@emit_mono.vl:6475` |
| 98 | 2 | `i32ListIndexOf@listutil.vl:38`, `elSecOf@emit_link.vl:1267` |
| 94 | 2 | `identCalleeAt@ast.vl:2070`, `zextLoadCallName@wasmEmit.vl:25755` |
| 82 | 3 | `recDeclInit@check_record_origins.vl:342`, `igLetInit@emit_sections.vl:6837`, `lintLetInit@lint.vl:1953` |
| 82 | 3 | `letAnnOf@check_query.vl:413`, `lintLetAnn@lint.vl:3385`, `slotLetAnn@check_width_slot.vl:258` |
| 80 | 2 | `memberDeclPos@check_types.vl:4869`, `armDeclPos@emit_rep.vl:3834` |
| 80 | 2 | `sTwinRepOf@emit_classify.vl:8659`, `structTwinRep@wasmEmit.vl:13871` |
| 78 | 2 | `sidArrGet@symbols.vl:515`, `rlColAt@emit_collect.vl:1119` |
| 76 | 2 | `tyIsNullUnit@emit_rep.vl:2918`, `tyIsNullPrim@emit_map_value_slots.vl:94` |
| 75 | 4 | `mapValSoftBase@check_ty_rep.vl:1118`, `joinStoreTy@check_ty_relate.vl:281`, `fnSlotStoreTy@check_relate_core.vl:4244`, `repCanonFieldTy@emit_rep.vl:530` |
| 73 | 2 | `tyStepElem@tyquery.vl:64`, `monoListElemTy@emit_mono.vl:24042` |
| 72 | 2 | `lintAnnName@lint.vl:1860`, `annNameOf@parser.vl:3778` |
| 71 | 2 | `monoIdentNameOf@emit_mono.vl:26872`, `expIdentName@check_pins.vl:1074` |
| 62 | 2 | `emitExprAsKind@wasmEmit.vl:24093`, `emitCoalesceScalarDefault@wasmEmit.vl:41468` |
| 61 | 2 | `arrLitArenaElemRow@emit_shape_rows.vl:2393`, `arrLitElemTyIxOf@emit_collect.vl:1107` |
| 60 | 21 | `nodeTyIsNulI32List@check_node_tys.vl:483`, `nodeTyIsStruct@check_node_tys.vl:548`, `nodeTyIsUnionish@check_node_tys.vl:589`, `nodeTyIsNullableStruct@check_node_tys.vl:983`, `inferRetNameByNode@check_infer_ret.vl:36`, `nullablePartOf@emit_base.vl:2426`, `unionHasAtom@emit_base.vl:2746`, `annArrowAt@emit_base.vl:2833`, `tyIsStructWithLitUnionField@emit_base.vl:2837`, `structLitUnionFieldAt@emit_base.vl:2841`, `isUNameDeclAB@emit_union_registry.vl:442`, `annIsNulLitUnionArray@emit_shape_rows.vl:1139`, `nameIsStructDecl@emit_shape_rows.vl:1703`, `typeDeclNameIxSync@emit_shape_rows.vl:1725`, `tyIsNulStrArr@emit_nullable_rets.vl:724`, `annIsNulStrListDeep@emit_nullable_rets.vl:742`, `clsCensusEnter@emit_cls_census.vl:31`, `clsCensusAtI@emit_cls_census.vl:45`, `clsCensusAtB@emit_cls_census.vl:50`, `clsCensusAtS@emit_cls_census.vl:55`, `cloCallResultLitUnion@emit_closure_callee.vl:337` |
| 60 | 2 | `repScanLim@emit_rep.vl:3237`, `sScanLim@emit_atom_kinds.vl:945` |
| 51 | 2 | `litPeekBaseTy@tyquery.vl:117`, `litArmBaseTy@emit_rep.vl:2209` |
| 49 | 2 | `tyIsCompositePat@check_types.vl:4528`, `tyHasUnionShape@emit_variant_sig.vl:431` |
| 48 | 2 | `tyIsRecord@check_types.vl:350`, `monoTyIsObj@emit_mono.vl:3003` |
| 48 | 2 | `tyIsMapAt@emit_ty_canon.vl:850`, `slotIsMapTy@check_width_slot.vl:568` |
| 48 | 2 | `lkUWidth@link.vl:1142`, `ulebWidth@emit_sections.vl:9966` |
| 47 | 2 | `tyIsListTy@check_fit_rules.vl:9434`, `slotIsListTy@check_width_slot.vl:571` |
| 42 | 2 | `indexBaseOf@emit_elab.vl:19076`, `mfrIndexObj@mfr_shadow.vl:255` |
| 41 | 2 | `letNameAt@ast.vl:2057`, `ctnDeclName@check_assignable.vl:1291` |
| 40 | 2 | `identNameAt@check_narrow_paths.vl:1129`, `identNameOrEmpty@emit_ty_canon.vl:855` |
| 40 | 2 | `monoPinOwnSubTy@pin_spell.vl:385`, `monoPinSubTyOf@emit_mono.vl:8169` |
| 31 | 2 | `unSiteOnKey@emit_union_registry.vl:283`, `unSiteOnTyKey@emit_union_registry.vl:290` |
| 28 | 3 | `toMix1@emit_type_order.vl:615`, `lkH@link.vl:1302`, `ihMixByte@iface_hash.vl:230` |
| 25 | 2 | `cboxDeclKey@emit_state.vl:212`, `monoDeclCanon@emit_mono.vl:22003` |
| 20 | 5 | `declKeyOf@check_types.vl:4959`, `numLitRetypeLeaf@check_num_adopt.vl:476`, `bcRegionLeaf@emit_closure_callee.vl:131`, `drwRecvNotAPlace@emit_rewrite.vl:1654`, `pbAt@parse_bank.vl:208` |
| 20 | 6 | `cwIxReadPastBuild@check_write_scan.vl:254`, `elabDeliveredRowClassUnset@emit_elab.vl:522`, `tagRepTyUnset@emit_shape_rows.vl:916`, `unionFieldNameUnset@emit_shape_rows.vl:2897`, `tagRepNameUnset@emit_shape_intern.vl:254`, `fnRecordedRetTyUnset@emit_classify.vl:1132` |
| 20 | 2 | `annRowOfNode@emit_union_atoms.vl:2622`, `fdRowOf@emit_collect.vl:1055` |
| 19 | 2 | `isDigit@lexer.vl:192`, `isDigitCode@driver.vl:6507` |
| 19 | 2 | `omDotStr@check_leaf_steps.vl:3310`, `optMemberDot@format.vl:2675` |
| 15 | 4 | `cexWideLeaf@check_num_lits.vl:446`, `armPathArenaDeclined@emit_union_atoms.vl:2262`, `checkSymDiagsComplete@driver.vl:2057`, `cliValidateNamesFile@cli.vl:806` |
| 14 | 3 | `symOccEndLine@check_query.vl:222`, `symSpanStartLine@driver.vl:2096`, `tokSpanStartLine@driver.vl:2321` |
| 14 | 2 | `nicheReadStashSlot@emit_start_block.vl:739`, `unionLitIsStashSlot@emit_if_arm_values.vl:108` |
| 11 | 2 | `lbiArithOp@check_num_lits.vl:225`, `cexOp@check_num_lits.vl:301` |
| 11 | 2 | `collectRetValues@check_nj_join.vl:411`, `a20CollectRets@check_leaf_steps.vl:2657` |
| 11 | 2 | `fbI32Bin@emit_bytes.vl:1055`, `fbNumOp@wasmEmit.vl:25340` |
| 9 | 2 | `repStampListBuilt@check_fit_rules.vl:9242`, `repStampHeldRead@check_fit_rules.vl:9245` |
| 7 | 2 | `symSpanStartCol@driver.vl:2097`, `tokSpanStartCol@driver.vl:2322` |
| 7 | 2 | `symSpanEndCol@driver.vl:2099`, `tokSpanEndCol@driver.vl:2323` |
| 5 | 2 | `symCount@driver.vl:2095`, `tokCount@driver.vl:2319` |

78 groups, 10653 redundant bytes.
