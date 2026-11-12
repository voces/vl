# L1: the instance reads of an open type, classified site by site, 2026-11-12

`ARCHITECTURE.md` §7's L1 line (§3.5, §4.1) holds a count, not a classification. The 2026-11-11
recount (`2026-11-11-l1-instance-reader-recount.md`) found 94 `nodeTyIxOf` sites reading a type
with type parameters while an instance is emitted, and left them unclassified. The exit criteria
(`2026-11-11-step7-exit-criteria.md`) make classifying them L1's exit item. This note does that.
w318 holds the line, and the orchestrator handed the classification to w308. Base is master
`77d45015` plus #7303 and #7307 (docs only), with a fixpoint seed of 6,623,600 bytes.

## Method

Two probe compilers, each built by the master fixpoint seed into scratch and never refreshed into
`build/`. Neither uses the recount's byte marker, which poisons a seed.

- **Reach.** A generator rewrites each one-line `nodeTyIxOf(x)` call in `compiler/emit_*.vl` and
  `wasmEmit.vl` (959 sites) as `l1At(site, nodeTyIxOf(x))`. A site marks itself when the type
  holds a type parameter and the `FuncDecl` being emitted (`emitCurFnIx`) is an instance, its name
  carrying `$`. The marks are a base-64 bitset. `emitProgram` reports them in place of its result,
  which keeps them under the sweep's 220-character message cut.
- **Difference.** The same rewrite, but at a marked read the site also asks
  `nodeTyAt(x, emitCurFnIx)`. It marks only where that instance type is a different, closed type.
  Where it never differs, the template read has no better answer to read.
- **Controls.** A generic `first<T>` called at two types marks sites in both probes. A program with
  no generic marks none and runs.

Population: the sweep's 23,925 programs.

- **Reach:** **86 sites** in 3,655 programs, against the recount's 94 on master `2fb114d7`.
- **Difference:** in 60 of the 86 sites the instance type differs, in 3,622 programs.

## The classification

| class | sites | grade |
| --- | --- | --- |
| the instance type never differs | 26 | by design: the instance gives no other type |
| a resolver, or a reader that also asks the instance type | 21 | by design: the template type is the resolver's input |
| an openness gate: the read only asks whether the template is open, then routes to an instance answer | 19 | by design |
| a `…Tpl` function: the answer every frame shares, by contract | 2 | by design |
| a raw read of an open type with no instance answer beside it | **18** | **convert to `nodeTyAt(x, fnIx)`** |

**By design: the instance type never differs (26).**

| site | function | programs reaching it | programs where the instance type differs |
| --- | --- | --- | --- |
| `emit_classify.vl:942` | `fnSigKeyOf` | 7 | 0 |
| `emit_classify.vl:1254` | `fieldValueTakesFnTy` | 3 | 0 |
| `emit_classify.vl:5234` | `cloCallSigKey` | 36 | 0 |
| `emit_classify.vl:5321` | `cloCallSigKey` | 23 | 0 |
| `emit_classify.vl:5322` | `cloCallSigKey` | 4 | 0 |
| `emit_classify.vl:6852` | `arrLitArenaRecElem` | 1 | 0 |
| `emit_classify.vl:6853` | `arrLitArenaRecElem` | 10 | 0 |
| `emit_classify.vl:13480` | `fnHandsBackTaggedParam` | 13 | 0 |
| `emit_classify.vl:13499` | `fnHandsBackTaggedParam` | 10 | 0 |
| `emit_closure_sites.vl:541` | `ifExprValtype` | 21 | 0 |
| `emit_collect.vl:5310` | `collectAArrayLit` | 2 | 0 |
| `emit_collect.vl:6320` | `arrLitBuildTy` | 10 | 0 |
| `emit_elab.vl:10861` | `elabRetParamOf` | 25 | 0 |
| `emit_elab.vl:16865` | `elabHolderSlotTy` | 1 | 0 |
| `emit_elab.vl:16973` | `elabRetOf` | 23 | 0 |
| `emit_elab.vl:17993` | `elabArmSigAt` | 1 | 0 |
| `emit_elab.vl:19178` | `elabOutTyVia` | 4 | 0 |
| `emit_elab.vl:19273` | `elabParamTyOf` | 16 | 0 |
| `emit_fn_scans.vl:2176` | `fnUnionRetSinkOk` | 7 | 0 |
| `emit_if_arm_values.vl:556` | `ifJoinIsScalarPrim` | 22 | 0 |
| `emit_list_rep.vl:369` | `paramString` | 3 | 0 |
| `emit_rep.vl:1209` | `nodeMapTyIx` | 3 | 0 |
| `emit_shape_rows.vl:3597` | `arrLitArenaElemRow` | 18 | 0 |
| `emit_sig_tokens.vl:330` | `paramStructIndex` | 14 | 0 |
| `emit_union_atoms.vl:2697` | `annRowOfNode` | 2 | 0 |
| `emit_value_sites.vl:774` | `arrLitElemKind` | 11 | 0 |

**By design: resolvers and paired readers (21).** These are the elaboration's and the frame's own
reads of the template, the input to the substitution they perform:

- `nodeTyAt`, `scopeTyAt` and `nodeTyInOf`;
- `elabCheckedTyOf`, `litRepTyIn`, `litRepTyAt` and `elabNodeInstTys`;
- `holeOperandTyOf` and `exactOperandTyOf`;
- `repOfNodeAt`, whose own type is the closed-template check.

The rest also read the instance type in the same function.

| site | function | programs reaching it | programs where the instance type differs |
| --- | --- | --- | --- |
| `emit_capture_frames.vl:564` | `nodeTyAt` | 456 | 196 |
| `emit_capture_frames.vl:601` | `scopeTyAt` | 3643 | 3605 |
| `emit_classify.vl:2037` | `readTypeVerdictGo` | 15 | 14 |
| `emit_classify.vl:2038` | `readTypeVerdictGo` | 11 | 11 |
| `emit_classify.vl:6484` | `arrLitFrameRefTy` | 129 | 129 |
| `emit_classify.vl:8112` | `exactOperandTyOf` | 930 | 929 |
| `emit_classify.vl:9532` | `coalHoleNulNumTy` | 12 | 12 |
| `emit_classify.vl:11837` | `exprListRep` | 1277 | 1130 |
| `emit_classify.vl:13869` | `readRepOf` | 3140 | 3086 |
| `emit_elab.vl:14066` | `elabCheckedTyOf` | 3643 | 3605 |
| `emit_elab.vl:14067` | `elabCheckedTyOf` | 828 | 782 |
| `emit_elab.vl:16178` | `elabCalleeTyOf` | 24 | 8 |
| `emit_elab.vl:17589` | `litRepTyAt` | 263 | 168 |
| `emit_elab.vl:17832` | `elabNodeInstTys` | 256 | 177 |
| `emit_elab.vl:19454` | `litRepTyIn` | 3319 | 3293 |
| `emit_rep.vl:3967` | `repOfNodeAt` | 361 | 323 |
| `emit_ty_canon.vl:803` | `holeOperandTyOf` | 514 | 456 |
| `emit_ty_canon.vl:841` | `nodeTyInOf` | 1325 | 1212 |
| `emit_union_casts.vl:269` | `asExprIsUnionCast` | 9 | 9 |
| `wasmEmit.vl:5517` | `litIsPinNever` | 4 | 4 |
| `wasmEmit.vl:39723` | `coalHoleMapReadNullTest` | 13 | 13 |

**By design: openness gates (19).** Each reads the template only to ask whether it is open, through
`tyHasTyVar`, `tyHasInferHole`, `tyMentionsTyVarNamed` or a `TyVar` test, and answers per instance
when it is.

| site | function | programs reaching it | programs where the instance type differs |
| --- | --- | --- | --- |
| `emit_classify.vl:2063` | `readTypeVerdict` | 489 | 488 |
| `emit_classify.vl:2064` | `readTypeVerdict` | 500 | 499 |
| `emit_classify.vl:4257` | `structIndexOfObjCtxMemo` | 6 | 2 |
| `emit_classify.vl:5360` | `cloElabSigKey` | 99 | 63 |
| `emit_classify.vl:5579` | `instanceOperandTyOf` | 26 | 26 |
| `emit_classify.vl:7740` | `holeNulLitElemTy` | 51 | 46 |
| `emit_classify.vl:8261` | `loopVarElemPinTyOf` | 215 | 215 |
| `emit_classify.vl:9868` | `letNulScalarBoxName` | 58 | 57 |
| `emit_collect.vl:6309` | `arrLitInstElemRows` | 2 | 2 |
| `emit_elab.vl:715` | `declOpen` | 1 | 1 |
| `emit_elab.vl:1397` | `elabSigReads` | 27 | 15 |
| `emit_elab.vl:1399` | `elabSigReads` | 51 | 3 |
| `emit_lit_atoms.vl:214` | `arrElemInstTyAt` | 147 | 3 |
| `emit_mono.vl:1580` | `monoReadsUnfilledNull` | 2 | 2 |
| `emit_union_casts.vl:298` | `asExprOperandIsHole` | 9 | 9 |
| `wasmEmit.vl:21314` | `readMayBeNulUnit` | 173 | 103 |
| `wasmEmit.vl:26461` | `cloArgInstanceMisfits` | 7 | 6 |
| `wasmEmit.vl:37153` | `njBoxHoldsNull` | 15 | 15 |
| `wasmEmit.vl:39873` | `emitCoalesceGo` | 22 | 22 |

**By design: template by contract (2).** `arrLitIsRefTpl` and `arrLitElemNameTpl` answer what every
frame shares. A frame that needs its own answer asks `arrLitFrameRefTy` first.

| site | function | programs reaching it | programs where the instance type differs |
| --- | --- | --- | --- |
| `emit_classify.vl:6550` | `arrLitIsRefTpl` | 105 | 17 |
| `emit_classify.vl:6970` | `arrLitElemNameTpl` | 6 | 4 |

**Convert (18).** Each reads a type parameter's template where the instance has a closed type.

| site | function | programs reaching / differing | owner |
| --- | --- | --- | --- |
| `emit_classify.vl:2370` | `letStoreHeldTy` | 258 / 108 | w318 |
| `emit_classify.vl:4320` | `objLitTaggedFieldRow` | 70 / 53 | w318 |
| `emit_classify.vl:4333` | `objLitTaggedFieldRow` | 12 / 1 | w318 |
| `emit_classify.vl:9607` | `ifBuiltAtRecord` | 23 / 1 | w318 |
| `emit_obj_lit_fits.vl:1123` | `nodeTyIsUnionRow` | 1 / 1 | w318 |
| `emit_obj_lit_fits.vl:1356` | `emptyArrHoleElemSlot` | 39 / 39 | w318, in flight in #7243 (`nodeTyAt(ax, fnIx)`) |
| `emit_ref_list_kinds.vl:262` | `emptyArrHoleKind` | 39 / 39 | w318, in flight in #7243 (`nodeTyAt(ax, fnIx)`) |
| `emit_shape_rows.vl:3011` | `arrLitBoxElemName` | 129 / 18 | w311 |
| `emit_shape_rows.vl:3030` | `arrLitNulBoxElem` | 129 / 18 | w311 |
| `emit_shape_rows.vl:3163` | `arrElemIsClosureArena` | 129 / 18 | w311 |
| `emit_shape_rows.vl:3200` | `arrLitMapElemName` | 20 / 17 | w311 |
| `emit_shape_rows.vl:3213` | `arrLitElemRendersNoMap` | 105 / 17 | w311 |
| `emit_shape_rows.vl:3265` | `arrLitElemRender` | 46 / 21 | w311 |
| `emit_shape_rows.vl:3358` | `arrLitNestedElemName` | 265 / 177 | w311 |
| `emit_shape_rows.vl:3410` | `arrLitShapeElemName` | 160 / 160 | w311 |
| `emit_shape_rows.vl:3456` | `arrLitNulRefElemName` | 289 / 178 | w311 |
| `emit_shape_rows.vl:3517` | `arrLitNominalElemTy` | 114 / 17 | w311 |
| `emit_union_casts.vl:421` | `asExprNumSrcName` | 3 / 3 | w318 |

- **w311 (10):** the ten `emit_shape_rows.vl` producers are the `arrLit*` name and row producers,
  in the shape-rows lane (rows keyed by type). Each differs in 17 to 178 programs. The common witness
  is D12920's or D105's generic list literal.
- **w318 (8):** `letStoreHeldTy`, `objLitTaggedFieldRow` (two reads), `ifBuiltAtRecord`,
  `nodeTyIsUnionRow` and `asExprNumSrcName`, plus the two empty-`[]` readers that #7243 converts.
  The four `emit_classify.vl` sites sit in a file w314 is cutting, so the convert coordinates with
  w314.

All 86 sites' programs run. The probes change no output, because they replace the program's result
only in the probe build. A convert is graded the usual way: a probe that the instance answer
changes no bytes, or a sweep naming each mover.

## For the L1 line

L1 can be deleted once the 18 converts land; the 68 by-design sites stay with the reasons above.
The line also reports `bindGenWalk` and `monoArgTyName` call counts. They are counts, not
instance reads, and this classification does not grade them.
