# Exit checklist, re-census of 2026-11-07 (evening)

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Exit checklist, re-census of 2026-11-07, evening** (master `3401b65f2`, 967 `emit_mono` functions;
#6645 graded from its merge, `6cad6cae4`). The 165 functions the morning census left, each graded by the record that
moved it since (§3.4, #6626 to #6685, with f81c3c7da) and by a fresh function-entry probe over 23,384 programs.
Reach is the number of programs that enter the function.

| family | listed | switched | (c) | blocked | parked | unassessed | deleted |
|---|---|---|---|---|---|---|---|
| unbound default | 9 | 5 | 1 | 0 | 2 | 0 | 1 |
| slot held fns | 23 | 8 | 10 | 0 | 4 | 0 | 1 |
| slot deliveries | 6 | 6 | 0 | 0 | 0 | 0 | 0 |
| node type | 25 | 7 | 5 | 7 | 1 | 0 | 5 |
| slot type | 24 | 14 | 4 | 0 | 2 | 0 | 4 |
| lambda sigs | 7 | 4 | 2 | 1 | 0 | 0 | 0 |
| instance binding | 31 | 7 | 11 | 0 | 3 | 0 | 10 |
| value returns | 5 | 1 | 4 | 0 | 0 | 0 | 0 |
| instance result | 1 | 1 | 0 | 0 | 0 | 0 | 0 |
| walk type | 19 | 8 | 11 | 0 | 0 | 0 | 0 |
| call param | 13 | 3 | 1 | 8 | 0 | 0 | 1 |
| uncalled slot | 2 | 0 | 2 | 0 | 0 | 0 | 0 |
| **all** | **165** | **64** | **51** | **16** | **12** | **0** | **22** |

Switched, (c) or deleted: **137 of 165**, against 84 in the morning's table (38 switched and 46
(c)). What stands between master and the endpoint is
16 blocked and 12 parked functions, and none unassessed. Per family, with reach:

- **unbound default**:
  - switched: `monoDefaultUnboundTyParams` 9,004 (#6677), `monoDefaultTyParamsOnlyGenFns` 8,697 (the type it binds is `elabUnboundTpTy`'s through `monoBindTyParamElab`; mono keeps only the gate, a type parameter named only by function slots handed generic values. Shadowed pre-walk 2026-11-07: 10 binds in 4 programs, 8 equal the call key's binding, 2 calls in a generic body have no key and the reader gives the default, 0 differ), `monoUncalledSlotFnTy` 293, `monoUncalledListElems` 209, `monoHoleFnPinTyOf` 19, `monoUncalledNestedListElems` 15.
  - (c): `monoChoiceArmFlowTy` 7,920.
  - parked: `monoElabStubArgsPrime` 18,172 (was `monoElabDefaultsPrime`; its defaults half is the elaboration's since #6677, and the stub half waits on D15494, #6683).
    Since 2026-11-07 the defaults half of the prime is the elaboration's own (`elabTpDefaultsPrime`, run by `elabRun`, with the rule's predicates moved to `emit_elab`). Mono keeps the stub half, `monoElabStubArgsPrime`: an argument of only uncalled hole functions keyed at the `() => void` stub, which is parked under D15494 (owner): shadowed pre-walk, 102 stubs in 54 of 23,103 programs, every argument still open at the checker (`(_, _) => _` 40, `(_) => string` 18, `(_) => _` 15, `(_) => void` 11, `(T) => T` 10, a list of stubs 5, `(_) => i32` 3), so no closed fact answers one. `monoDefaultUnboundTyParams` is live: deleting it turned `generics/unbound-type-param-defaults-at-call.vl` into invalid wasm, and on that fixture its 5 bindings equal the call key's.
    `monoDefaultUnboundTyParams` is switched: the type it binds is the elaboration's `elabUnboundTpTy`, the closed binding of the call's instance key (`elabCallBindTy`) else the default, over the elaboration's own defaults table (`elabTpDefaulted`). Shadowed pre-walk over 23,103 programs it bound 35 times in 20 programs: 30 equal to the key's binding, 0 different, and 5 with no key to compare. Those 5 are the residue the reader's default answers: D4126 and the stub-signature fixture `closures/list-of-generic-element-called-at-its-stub-signature.vl` (a call mono mints when it rewrites a literal slot's read to a direct call, after the elaboration ran, so it has no key; the parameter is body-only and the default is what a key would hold; the stub-signature file is D15494's), and `closures/generic-fn-as-list-callback-result.vl` at a binding boundary with no call.
    The two other mono sites that named the unbound default read the elaboration too (2026-11-07). `elabUnboundTpTy(call, inst, tp)` also answers a variable of emitted function `inst`: that instance's closed binding, else the default. `monoArgTyNameRep`'s last rung (an argument typed a bare type variable, or a list of one, that no instance closes) pins what it answers; shadowed pre-walk it fell to the default 8 times in 5 programs, every time with the argument's identity type open. `monoOpenArgDefaultPin` keeps its gate (the argument's own type open) and takes the argument's identity type (`elabIdentityTy`), else the reader: of its 396 decisions, 394 equalled the identity type and 2 were the rung's own arguments. 11 programs trap before either site and were graded by output.
    Probe note: a build reports only its first `emitFail`, so a probe that emits one row per site shows the first row alone; collect the rows into one message and flush it once after `emitProgramRun`. Clear the collection at the start of `elabPrepare`, not of `emitProgram`: the elaboration and mono's prime run there, at the end of check and before emit, so a clear at emit wipes every row they raised. Grade a pin's type against the argument's frozen type, not the parameter's: mono's pin-type column holds the type the argument is delivered at (`monoArgPinTyIx`), which differs from a union parameter's by design.
    Probe note: a note channel that drops a note already seen in the build counts program × outcome rows, not decisions, so a function deciding twenty times in one program reads as one row. The classification it gives (agree, differ, none) holds; the magnitude is a floor. Count decisions with a counter. Lane F's tables of 2026-11-07 (#6658, #6662, #6668, #6674, #6679) were taken that way and are reworded below.
  - deleted: `monoArgClosedPin`.
- **slot held fns**:
  - switched: `monoWrittenGenLetFrame` 9,585, `monoFlowDeclVals` 8,049, `monoCoerceWrittenLetTys` 5,799 (at the by-call site, on `elabValueInstKey`, #6645 at `6cad6cae4`; the 9 alias and copy rows with no key wait on Fn#d's delivery arm, and the delivery path is mono's by design), `monoArmWrittenLetSeed` 1,613, `monoFlowLetLeaf` 642, `monoFlowKeptIndexElem` 523, `monoFlowValsOf` 83, `monoFlowLetMapLeaf` 75.
  - (c): `monoFlowReadsAll` 9,585, `monoFlowReadsRound` 9,585, `monoFlowReplanPending` 9,585, `monoFlowLetCalls` 8,049, `monoFlowUsePlanAt` 2,938, `monoFlowUsePlan` 2,938, `monoFlowAliasReadVals` 1,186, `monoFlowMapVals` 384, `monoFlowRetLocalLists` 91, `monoFlowElemsGen` 87.
  - parked: `monoWalkIdentCall` 9,585 ((S1) reverse map source decl -> instance clone; argument-keyed instances wait on identity typing (A), owner-level; call_ref policy is mono), `monoFlowMapReadVals` 291 (lane F map-value facts (beside the six Map() bundle reads)), `monoCellCall` 260 (a per-instance signature for the capture rewrite's cell read, keyed through the captured binding at the capture frame's key (#6676)), `monoFlowAliasMaps` 230 (lane F map-value facts (beside the six Map() bundle reads)).
  - deleted: `monoLetSeedGenFe`.
- **slot deliveries**:
  - switched: `monoCallIfBound` 9,585, `monoCallWrittenLet` 9,585, `monoPinListElems` 6,803, `monoCoerceWrittenCell` 906, `monoStoredSlotFnTy` 134, `monoRetLitElemTy` 74.
- **node type**:
  - switched: `monoCgcTplTy` 1,757, `monoCbFnListRowSpell` 1,111, `monoBoundFnListElemsTy` 344, `monoHoleFnPinTy` 39, `monoPinnedListAnnTy` 3, `monoPinnedAnnTyAt` 3, `monoLetWritesRecord` 7 (the written holder's slot fact, #6682).
  - (c): `monoPinnedOperandTy` 4,844, `monoPinBin` 4,310, `monoSubstLetType` 3,342, `monoCloneLetDecl` 3,326, `monoDeadNullTest` 869.
  - blocked: `monoArgClosedTyIn` 5,504 (the delivery signature of an argument whose eventual consumer is a hole function forwarded through a generic: the type the forwarded callee takes, at the call key. `elabInstNodeTy` agrees at 452 of 652 program-outcome rows, but D5930's `hole-leaf-literal-through-forwarder` (`outerI`) rules it out: mono builds `[v]` at the callee's `f64[]` where the instance type is the literal's own `i32[]`), `monoCoerceListCbArg` 2,877 (callback signature over a list element where the elaboration made no instance: 88 callback decisions are mono-derived and 69 of them, in 27 programs, have no fact; the receiver half takes `elabIdentityTy` first (#6656), and its 28 fallback decisions in 10 programs have no receiver fact), `monoPinReturnedObj` 2,000 (Fn#d: d3125 lambdas returning records), `monoRetFnListTy` 608 (Fn#d: returned lists of hole lambdas), `monoClosedObjLitTy` 170 (Fn#d: records holding functions), `monoClosedFieldValTy` 4 (records of functions: switched by #6636, re-blocked by #6644 (8/8 was mono read back post-walk); waits on function-holding fact), `monoCloseRetFnTy` 1 (no fact: its 2 decisions, a stored call returning a list of functions, have no elaboration fact).
  - parked: `monoInitHeldTy` 6,723 (a named hole function stored in a map has no member-instance key (`elabValueInstKey` family); MULTI where called at two types).
  - deleted: `monoLetAnnTyOf`, `monoLetWriteRhsTy` and `monoLetWriteRhsTyRec` (#6682), `monoModuleDupPin` and `monoModuleLetPin` (f81c3c7da).
- **slot type**:
  - switched: `monoBindingAdoptInit` 9,557, `monoHoleGenFnPin` 7,939, `monoPinMapValues` 6,746, `monoPinRecordFields` 732, `monoPinObjFields` 694, `monoPinRecordField` 465, `monoPinNestedListElems` 296, `monoPinFieldContainer` 118, `monoPinFieldValue` 115, `monoPinMapSlot` 59, `monoLetWritesAt` 37, `monoPinStoredRecords` 16, `monoHandWrittenLet` 2 (already reads the written-let signature in code), `monoLetWritesClosed` 747 (each write's type is the elaboration's: a record literal's identity, else the read binding's pre-walk type, #6682).
  - (c): `monoPinFieldContainers` 797, `monoRetypeLamCells` 564, `monoWritesCoercedFirstCall` 441, `monoRenameInitAt` 13.
  - parked: `monoReachLitTys` 9,560 (parked with monoReachSlotTy), `monoReachSlotTy` 6,935 (13 lane F, 2 reach).
  - deleted: `monoNoteBindCall`, `monoListSrcElemTy`, `monoPinJoin`, `monoSigJoin`.
- **lambda sigs**:
  - switched: `monoLamSubstParams` 1,188, `monoPinMapLambdas` 9,004 (the callback's parameter at the instance, `elabInstNodeTy` under the walk key, else `elabValueInstSig`, else the receiver's element; #6670), `monoDeliverLamLit` 6,170 (a hole lambda literal at its identity type at the frame, else `elabValueInstSig`; the destination's spelling where the signature agrees, since instances are keyed by it, #6678), `monoNoteBindDeliveryCall` 7,181 (`elabValueInstSig`, the one signature the delivered read's instances share; a read instanced at several (D12234) or at none keeps the destination's spelling, which is prerequisite (A)'s; #6665).
  - (c): `monoPinBodyLambdasRaw` 9,004, `monoCloneLambdaSubst` 1,258.
  - blocked: `monoLamParamPinAnn` 801 (split-dep holder fact (c2) + per-instance identity residual (4b-i); its pin now used only where elaboration open (#6662)).
- **instance binding**:
  - switched: `monoPreBindPastEmptyLit` 8,697, `monoPinAnnotatedParam` 5,744, `monoParamPinnedNull` 5,585, `monoExactBind` 1,261, `monoInstParamPinTys` 441, `monoPreBindNonArrowArgs` 46, `monoPreBindPastUnionRest` 8,697 (the call's elaboration binding, `elabCallBindTy`: 26 of 26 program-outcome rows).
  - (c): `monoCadNoteInstance` 9,004, `monoMakeInstanceLetTyCol` 9,004, `monoBindEnclosingPins` 9,004, `monoMakeInstanceGo` 9,004, `monoSlotParamPins` 8,698, `monoInstantiateCallIn` 8,697, `monoSlotSig` 8,694, `monoBindCols` 3,421, `monoSubstAnnNode` 1,227, `monoSubstTyArgNodes` 47, `monoLayoutConstOf` 4.
  - parked on the naming rule (owner item 4): `monoPinTyParamComposite` 391. Shadowed pre-walk (2026-11-07, 23,103 programs) over the 1,345 calls `monoElabCompositeTy` declines (864 function-typed annotations, 356 bodies testing a type variable, 125 others): the type is `elabCallParamTy`'s in 1,340. What mono still decides is the spelling, 201 calls that keep a declared or alias name (`Circle`, `Rows<Node>`, `AB`) for type tests and layout reads where the type renders structurally. 5 calls in 2 programs have no closed `elabCallParamTy` (`generics/open-generics-into-fn-typed-params-in-generic-body.vl`, `closures/generic-returned-fn-param.vl`), function-annotated parameters in a generic body, a producer question for Fn#d.
  - parked: `monoHoleBinding` 3,421 (function-holding residue stays on the rebuild: argument identity typing (A, owner-level, 689 programs) and bind-type-not-rep (56 sites); keyless lambda/value instances are the argument-keyed design (owner)), `monoPinnedTyParamCanon` 988 (waits on the key settling names (canonical instance key)).
  - deleted: `monoSeedCallSigTys`, `monoNicheNulParamsCheck`, `monoLetTyParamMisfit`, `monoExactPinTyOf`, `monoNicheNulListCheck`, `monoPoisonSharedPins`, `monoLetSeedMisfits`, `monoBindBareUnionArm`, `monoBindNullArm`, `monoBindInnerUnionArms` (their arms bind from `elabCallBindTy` through `elabBindUnionArmsFromCall`).
- **value returns**:
  - switched: `monoIfBoundRetAtPin` 24.
  - (c): `monoFlowConstCallArgs` 8,049, `monoDeliverCallRets` 1,009, `monoFlowCallLeafAt` 179, `monoFlowCallLeaf` 179.
- **instance result**:
  - switched: `monoPinnedRetAnnTy` 1.
- **walk type**:
  - switched: `monoPinCoalJoin` 2,717, `monoIfChainRebuildPinned` 2,639, `monoLamPinRetAnn` 1,112, `monoPinCoalListDefault` 781, `monoHoleNodeTy` 690, `monoNumOperandPinTy` 241, `monoPinnedTyOf` 7,366 and `monoLamCallTy` 561 (the D3616 instance exists: where either settles a type it takes `elabInstNodeTy` at the walk key, which agrees at 4,698 of 4,844 program-outcome rows and differs at none; mono's substitution answers the 146 it leaves open).
  - (c): `monoExprRebuild` 7,473, `monoPinRetype` 7,369, `monoPinFnValueTy` 4,942, `monoPinRecvName` 3,421, `monoPinRecvLit` 3,421, `monoPinMemberCall` 1,241, `monoNumUnionOpPin` 797, `monoHoleCoalUnion` 332, `monoSubstIsExpr` 53, `monoTpJoinObjTy` 51, `monoNumUnionCompoundPin` 1.

- **call param**:
  - switched: `monoPinHoleParam` 3,737, `monoPreBindArgName` 198, `monoPreBindArgTy` 198.
  - (c): `monoCallIfValue` 2,873.
  - blocked: `monoBindSeededTyParams` 8,688 (identity typing for the seed: binds from mono's pin of the argument it seeds; waits on that argument's elabIdentityTy replacing the pin (5 open decisions); measured after #6656 and #6645: 12 programs decide, every one seeded from a generic function value whose identity is open; `elabIdentityTy` answers 1, `elabCallBindTy` 1 and the value-instance signature none, all agreeing, so it waits on identity typing for function values (A)), `monoArgPinTyIx` 5,620 (needs a pin fact of its own after holes-close), `monoArgTyName` 5,448 (split-dep one-producer redesign; pin string now serves only instance name + annotation text (dedupe is tyCanonKey); kept arms wait on the naming rule), `monoArgPinName` 5,401 (rep cascade, mono-derived rung), `monoArgTyNameCascade` 340 (C9 load-bearing; C1-C8, C10, C11, C13 never answer, handed to split-dep one-producer redesign; naming rule), `monoArgTyNameBound` 321 (arms graded: B2 deleted (#6641); B1/B4 wait on naming rule; B8/B17 twin halves; B12/B13/B16 load-bearing; B3,B5,B7,B9-B11,B14,B15,B18 never answer, handed to split-dep one-producer redesign), `monoArgTyNameProjected` 223 (split-dep's one-producer redesign), `monoArgTyNameRep` 220 (split-dep's one-producer redesign (scalar tail unreached, D23)).
  - deleted: `monoSpelledRecordLeavesRow`.
- **uncalled slot**:
  - (c): `monoInertReach` 9,585, `monoInertParamStubPin` 4,706.

Reach of `monoModuleLetPin` is 0, as in the morning census.

**Six of the unassessed, measured** (2026-11-07, 23,103 programs, each against its elaboration fact
at the decision site):
- **`monoSpelledRecordLeavesRow` is deleted.** Against `elabParamTyOwnAt` at the instance's own key,
  it decided 125 times in 79 programs and never chose the argument, D10520's witness included: 64
  rows agreed with the elaboration's row, 56 named the argument and 5 named neither. A named floor in
  its arm moved no program over the population, so the arm was unreached. The 56 where the
  elaboration names the argument are served after it, since #6586 makes a minted instance's
  parameter types the elaboration's at its key.
- **`monoHoleFnPinTyOf` was already switched.** Of 31 calls, the 6 with an open type read
  `elabHoleFnClosed`, which answers all 6. The 25 with a closed type pass the call-param pin through.
- **`monoPreBindArgName` and `monoPreBindArgTy` read the checked type.** Their one rule types a bare
  `null` argument, whose checked type is `null` at all 86 decisions. They read `nodeTyIxOf` instead
  of restating it. Every other argument is the call-param hub's pin.
- **`monoFlowMapReadVals` and `monoFlowAliasMaps` are parked on lane F.** They gather the values a
  map read or a map-holding alias can give, which no elaboration fact enumerates yet. Lane F's
  map-value facts hold them, beside the six `Map()` bundle reads.

**What the open boxes need.** Three boxes can be ticked:
- **uncalled slot:** the four decision functions are deleted, and the two left are (c), `monoInertReach`'s index and `monoInertParamStubPin`;
- **instance result** and **literal arm row**, as already ticked.

The rest wait on these facts and questions, grouped by who holds them:
- **Fn#d, the elaboration declining a type that holds a function (8, node type):**
  `monoCloseRetFnTy`, `monoInitHeldTy`, `monoArgClosedTyIn`, `monoPinReturnedObj`, `monoRetFnListTy`,
  `monoBoundFnListElemsTy` and `monoClosedObjLitTy`. Also `monoCoerceListCbArg`, once both of its halves
  read the elaboration.
- **split-dep:**
  - the written-let per-instance signature, after the initialiser-fallback fix, plus the set-valued
    fold over a let's writes (D4307): `monoWrittenGenLetFrame`, `monoCoerceWrittenLetTys`,
    `monoArmWrittenLetSeed`, `monoLetSeedGenFe` and `monoHandWrittenLet`;
  - the holder fact (c2): `monoLamParamPinAnn`;
  - one producer behind `monoArgTyName`'s cascade: `monoArgTyName`, `monoArgTyNameCascade`,
    `monoArgTyNameRep` and `monoArgTyNameProjected`.
- **lane F:** `monoPinMapLambdas`, `monoNoteBindDeliveryCall` and `monoLamSubstParams`.
- **reach:**
  - the unbound default: `monoElabDefaultsPrime` and `monoDefaultUnboundTyParams`.
- **A lambda body as an elaboration instance (D3616):** `monoPinnedTyOf` and `monoLamCallTy`.
- **The call-param family's own facts:**
  - an inline `if` with no binding: `monoCallIfValue` and `monoSeedCallSigTys`;
  - a pin fact after holes-close: `monoArgPinTyIx`;
  - the rep cascade: `monoArgPinName`;
  - Fn#d's call-param hub: `monoPinTyParamComposite`.
- **Parked on design questions (5):**
  - argument-keyed instances, behind identity typing for concrete function values:
    `monoWalkIdentCall`;
  - mono's `call_ref` policy plus the written-cell signature: `monoCellCall`;
  - `monoReachSlotTy`, with 13 decisions for lane F and 2 for reach;
  - the key settling names: `monoPinnedTyParamCanon`;
  - a per-call rule no fact states: `monoDefaultTyParamsOnlyGenFns`.

The 45 unassessed functions need no new fact before their shadow. They are the next lane work,
largest first:
- slot type, 15: the record and map field pins and the written-let tails;
- instance binding, 12: the union-arm and null binds;
- node type, 10: the let-write and module pins;
- call param, 5;
- slot held fns, unbound default and others, 3.
