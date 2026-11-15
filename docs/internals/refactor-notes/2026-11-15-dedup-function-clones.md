# Source clones of one function body, folded to one definition, 2026-11-15

Lane B, from lane P's seed profile (`2026-11-15-size-push-grow-outline.md`, "The duplicate
bodies"), which lists 78 groups of byte-identical function bodies in the seed.

## The rule applied

For each group of real clones, one definition is kept and the others are deleted. The keeper
lives in the lowest module that every caller can import without making an import cycle. Every
caller, including the importers of an exported clone, is repointed to it.

- Generic list and string helpers go into `listutil.vl`, a leaf that imports nothing.
- The rest go into a module the callers already reach.

Each group was applied on its own and accepted only if two things held. First, the number of
modules on an import cycle stayed at 1, as on master. Second, the group left `emit_mono.vl`,
`emit_elab.vl`, `emit_rep.vl` and `check_types.vl` untouched; those are other lanes' open files.
`check_types.tyIsMap` is used as a keeper, but it was already exported, so that file is unchanged.

**Net compiler lines: −312** (48 files, +454 / −766). The insertions are mostly import lists
re-sorted by the formatter. **Pin-helper delta: 0.** The fixpoint seed is 5,443 bytes smaller
(6,906,378 → 6,900,935).

## Behaviour identity

Both seeds are fixpoints:

- `old` was built from master `ceb747a19`;
- `new` was built from this branch.

Building master's compiler source (`compiler/entry.vl`, 265 modules) with `new` produces a
module **byte-identical** to `old`. The control, building the same source with `old`, matches as
well. So the deduplicated compiler compiles the compiler exactly as master's does.

## Folded (39 groups)

| keeper | removed clones |
| --- | --- |
| `listutil.strLess` (new) | `emit_type_order.toLess`, `link.lkLess`, `format.fmtNameLess` |
| `listutil.strListSameMembers` (new) | `record_rows.rrSameNames`, `box_dst_shadow.bdsSameTexts` |
| `listutil.strMapListPush` (new) | `iface_hash.ihListPush`, `driver.expByAdd` |
| `listutil.strListDropLast` (new) | `check_relate_core.holeSlotPathSteps`, `cli_util.cliPopLast` |
| `listutil.strListAppend` (new) | `ast.pbStrPush`, `json_walk.jwAppend` |
| `listutil.strHasPrefix` (new) | `link.lkHasPrefix`, `emit_link.elHasPrefix` |
| `listutil.ulebWidth` (new) | `link.lkUWidth`, `emit_sections.ulebWidth` |
| `listutil.i32ListAt` | `bind.bdGet`, `emit_link.elAt`, `emit_collect.rlColAt` |
| `listutil.i32ListIndexOf` | `emit_link.elSecOf` |
| `symbols.sidArrPut` | `check_null_holes.lpColSet` |
| `iface_hash.ihMixByte` | `emit_type_order.toMix1`, `link.lkH` |
| `emit_base.capIsBound` | `lint.siHas` |
| `lexer.isDigit` | `driver.isDigitCode` |
| `tyquery.nhOpen` | `check_null_holes.nhIsOpenAt`, `check_fit_rules.tyIsOpenNullHole` |
| `tyquery.tyIsStringPrim` (moved) | `record_rows.rrIsString`, `emit_obj_lit_fits.tyIsStringPrim` |
| `tyquery.tyIsListTy` (moved) | `check_fit_rules.tyIsListTy`, `check_width_slot.slotIsListTy` |
| `check_types.tyIsMap` | `emit_ty_canon.tyIsMapAt`, `check_width_slot.slotIsMapTy` |
| `check_elab_cap.fnTagGetRecv` | `mfr_shadow.mfrChainGetObj` |
| `check_elab_cap.fnTagMembersWithin` | `check_fn_tag.ftMembersWithin`, `check_fn_tag.ftSetWithin` |
| `check_elab_cap.fnTagSetOfTy` | `emit_id_shadow.idTodaySetId` |
| `check_elab_cap.fnDeclNameIs` | `elab_fn_id.idDeclNamed` |
| `emit_join_records.recordFieldTy` | `record_rows.rrFieldTyOf` |
| `emit_bignum.bigBitLen` | `const_exact.cxmBitLen` |
| `ast.fnDeclNameAt` | `check_width_slot.slotFnName`, `check_pins.expFnDeclName` |
| `ast.identCalleeAt` | `wasmEmit.zextLoadCallName` |
| `ast.letNameAt` | `check_assignable.ctnDeclName` |
| `ast.letInitAt` (new) | `check_record_origins.recDeclInit`, `emit_sections.igLetInit`, `lint.lintLetInit` |
| `ast.letAnnAt` (new) | `check_query.letAnnOf`, `lint.lintLetAnn`, `check_width_slot.slotLetAnn` |
| `parser.annNameOf` | `lint.lintAnnName` |
| `check_narrow_paths.identNameAt` | `emit_ty_canon.identNameOrEmpty` |
| `check_nj_join.collectRetValues` | `check_leaf_steps.a20CollectRets` |
| `check_leaf_steps.omDotStr` | `format.optMemberDot` |
| `check_ty_rep.mapValSoftBase` | `check_ty_relate.joinStoreTy`, `check_relate_core.fnSlotStoreTy` |
| `check_num_lits.lbiArithOp` | `check_num_lits.cexOp` |
| `emit_union_registry.unRowHasMapArm` | `emit_start_block.unionRowHasMapArm` |
| `emit_union_atoms.annRowOfNode` | `emit_collect.fdRowOf` |
| `emit_shape_rows.arrLitArenaElemRow` | `emit_collect.arrLitElemTyIxOf` |
| `emit_classify.sTwinRepOf` | `wasmEmit.structTwinRep` |
| `emit_bytes.fbI32Bin` | `wasmEmit.fbNumOp` |
| `wasmEmit.emitExprAsKind` | `wasmEmit.emitCoalesceScalarDefault` |

`sidArrGet`, `rlColAt` and `i32ListAt` were separate groups in the profile only because `||`
and two `if`s compile differently. They mean the same, so `rlColAt` folds into `i32ListAt`.

## Not folded

- **Held for the lanes that own the file**:
  - six type-list comparers (`tyListSame` and five copies in `emit_elab`/`emit_mono`);
  - `elabFnIdsUnion` = `elab_fn_id.idUnion`;
  - `monoStrListHas` = `listutil.strListHas`;
  - `monoI32sSame` = `listutil.i32ListEq`;
  - `monoSeenHas` = `listutil.i32ListHas`;
  - `monoAnyBakedCallback` = `ast.hasNamedArgs`;
  - `monoFnDeclName` = `ast.fnDeclNameAt`;
  - `tyIsUnfilledNullHole` = `tyquery.nhOpen`;
  - `monoListElemTy` = `tyquery.tyStepElem`;
  - `monoTyIsObj` = `check_types.tyIsRecord`;
  - `monoPinSubTyOf` = `pin_spell.monoPinOwnSubTy`;
  - `monoIdentNameOf` = `check_pins.expIdentName`;
  - `monoPathWith` = `emit_elab.elabPathPlus`;
  - `elabNamesIdent` = `check_call_retire.isIdentNamed`;
  - `elabSnapKey`/`elabSlotKey`;
  - `fnTagOpenDecl`/`elabFnInstanced`/`fnDeclIsGeneric`;
  - `indexBaseOf`/`mfrIndexObj`;
  - `memberDeclPos`/`armDeclPos`;
  - `tyIsNullUnit`/`tyIsNullPrim`;
  - `repScanLim`/`sScanLim`;
  - `litArmBaseTy`/`litPeekBaseTy`;
  - `tyIsCompositePat`/`tyHasUnionShape`;
  - `repCanonFieldTy`;
  - `cboxDeclKey`/`monoDeclCanon`;
  - `symbols.sidArrPut`/`sidArrGet`'s listutil fold, since `emit_mono` imports both.
- **Same bytes, different contracts**:
  - `tyname.fieldNameOf`/`gaeHeadNameOf`, two named cuts whose header says they must stay apart;
  - `unSiteOnKey`/`unSiteOnTyKey`, two seams that agree only today;
  - `nicheReadStashSlot`/`unionLitIsStashSlot`, two roles sharing one scratch slot;
  - `repStampListBuilt`/`repStampHeldRead`.
- **One-line named stubs that share bytes by accident**: the ×30, ×21, ×21, ×6 and ×5 groups (for
  example `cexNoRoot`, `litUnionNoBase`, `nodeTyIsStruct`). Each names a missing arm or a retired
  answer, which the kind-ladder rule wants named.
- **The `driver.vl` sym/tok accessors**, a public API pair.
- **The `__map_set_N__` groups**, which are emitted helpers rather than source clones.
