# Exit checklist: the pin helpers, census of 2026-11-06

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

**Exit checklist: the pin helpers, census of 2026-11-06** (master `d0f6b7722`, 1,090 functions,
then #6491: 1,088). Every function the pin-helper budget counts is classified by what its decisions
read. A decision is a pin a function returns, a type it returns or records, or a gate choosing
between them. A function with several sources takes its weakest.

| class | reads | functions |
|---|---|---|
| a | the elaboration | 82 |
| b | the checker's node type or another checked fact | 146 |
| c | no type decision: syntax, cloning, renaming, registries, walk drivers | 635 |
| d | a mono-derived decision no elaboration fact owns yet | 225 |

(c) stays: mechanics are not a pin decision. (b) stays while the checked fact is the answer at the
instance. **(d) is the work list**, and "shrink the pin helpers" is done when it is empty. Each (d)
function is graded against its owning fact by the three-outcome shadow above, then switched or
deleted. The count is programs, of the 23,456, that reach any arm of the function, from an
arm-coverage run of 5,566 `emit_mono` arms. A walk driver reads high, so it ranks a family; it is
not a hit count for one decision. 209 of the 225 have an arm reached; 16 have none.

| family | owning elaboration fact | functions | programs reached, most | held by |
|---|---|---|---|---|
| unbound default | an elaboration-owned default for an unbound type parameter or hole | 12 | 18,170 | split-dep |
| slot held fns | `elabSlotHeldFns` of the binding or slot | 29 | 9,604 | split-dep |
| slot deliveries | `elabSlotDeliveries` of the binding or cell | 9 | 9,601 | — |
| node type | `elabNodeTyAt` at the instance | 29 | 9,592 | blocked on Fn#d |
| slot type | `elabSlotTyAt` / `elabSlotTys` of the slot | 27 | 9,578 | — |
| lambda sigs | `elabLamParamSigs` | 11 | 9,023 | lane F |
| instance binding | the instance key's binding (`ekTys`, `elabInstTyAt`, `elabParamTyOwnAt`) | 34 | 9,023 | reach, split-dep |
| literal arm row | the record solve's literal arm row (`litArmRowOf`) | 5 | 8,956 | — |
| value returns | `elabValueReturnsFrom` | 7 | 8,077 | reach |
| instance result | `elabRetOf` at the instance key | 10 | 8,023 | reach |
| walk type | `elabWalkTy` / `elabWalkNarrowedTy` at the instance | 33 | 7,470 | reach |
| call param | `callArgRepTy` over `elabCallParamTy` | 13 | 5,624 | split-dep |
| uncalled slot | `elabSlotUncalled`, and a default for an uncalled slot | 6 | 4,712 | — |

- [ ] **unbound default** (12): `monoElabDefaultsPrime` 18,170, `monoHoleGenFnFlowTy` 7,941, `monoChoiceArmFlowTy` 7,929, `monoDefaultTyParamsOnlyGenFns` 5,541, `monoArgClosedPin` 2,657, `monoUncalledSlotFnTy` 318, `monoUncalledListElems` 225, ~~`monoUnboundDefaultTy` 90~~, `monoBindTyParamDefault` 50, `monoDefaultUnboundTyParams` 21, `monoHoleFnPinTyOf` 21, `monoUncalledNestedListElems` 15.
  An empty `[]` argument of an unbound call is built at the elaboration's default instance
  (`elabArgBuiltTy`: the callee's parameter at that instance's bindings), which `monoArgClosedPin`
  reads where mono's own default rung was: 12 decisions in 6 programs, all byte-identical.
- [ ] **slot held fns** (29): `monoWalkIdentCall` 9,604, `monoWrittenGenLetFrame` 9,601, `monoFlowReadsAll` 9,597, `monoFlowLetCalls` 8,067, `monoFlowLetVals` 7,770, `monoFlowParamVals` 7,769, `monoFlowDeclVals` 7,740, `monoFlowValsOf` 7,511, `monoCoerceWrittenLetTys` 5,811, `monoFlowReadsRound` 2,993, `monoFlowUsePlanAt` 2,921, `monoArmWrittenLetSeed` 1,627, `monoFlowAliasReadVals` 1,174, `monoFlowLetLeaf` 655, `monoFlowRetLocalLists` 581, `monoFlowKeptIndexElem` 511, `monoFlowMapVals` 384, `monoFlowDirectSet` 186, `monoFlowAliasMaps` 170, `monoFlowElemsGen` 105, `monoFlowLetMapLeaf` 75, `monoFlowReadElemAt` 72, `monoFlowMapReadVals` 50, `monoFlowLoopVarVals` 26, `monoFlowReplanPending` 18, `monoLetSeedGenFe` 5, `monoCellCall` 5, `monoFlowReadElem` 0, `monoFlowUsePlan` 0.
  - A write never joins a binding's function set. `elabFnSetTy` is filled only by a read typed at
    a function type (`elabFnValNote`), and a `let`'s storage type is its initialiser's read's type,
    whose set it shares. So `let f = other` written `f = if c { inner } else { (n: i32) => … }`
    reads `{other}` at the let and at every read of it, though the written `if` carries no set
    (one arm is a closed lambda). D4307's program is the witness. The fix is the binding reader's:
    the binding's set is the fold of its written values' sets, "any" once one carries none.
- [x] **slot deliveries** (9): `monoCallIfBound` 9,601, `monoCallWrittenLet` 9,597, `monoPinListElems` 6,819, `monoCoerceWrittenCell` 913, ~~`monoReachSlotPins` 546~~, ~~`monoDeclPathPinsOrReach` 173~~, `monoStoredSlotFnTy` 152, `monoRetLitElemTy` 81, ~~`monoReachSlotPinsAt` 78~~ — switched (below): each reads `elabSlotDeliveries`, and what is left is mechanics.
- [ ] **node type** (29): `monoCloseRetFnTy` 9,592, `monoInitHeldTy` 6,742, `monoArgClosedTyIn` 5,475, `monoPinBin` 4,320, `monoPinnedOperandTy` 3,781, `monoSubstLetType` 3,348, `monoCloneLetDecl` 3,020, `monoCoerceListCbArg` 2,889, `monoPinReturnedObj` 1,945, `monoCbFnListRowSpell` 1,107, `monoDeadNullTest` 882, `monoCgcTplTy` 668, `monoRetFnListTy` 608, `monoPinnedAnnTyAt` 509, `monoLeafParamPin` 420, `monoBoundFnListElemsTy` 352, `monoPinnedReadTy` 341, `monoClosedObjLitTy` 174, `monoLetAnnTyOf` 66, `monoHoleFnPinTy` 33, `monoLetWriteRhsTyRec` 15, `monoPinnedListElemPin` 14, `monoLetWritesRecord` 6, `monoModuleDupPin` 3, `monoArgOpenValueTy` 1, `monoModuleLetPin` 0, `monoClosedFieldValTy` 0, `monoLetWriteRhsTy` 0, `monoPinnedListAnnTy` 0.
  **The ten the re-census left unassessed** (2026-11-07, the full population, against the
  elaboration's node type at the instance, else the checker's):
  - Switched:
    - `monoCgcTplTy`. Its hole read is `monoHoleNodeTy`, which is `elabWalkTy`; it agrees in
      1,622 of 1,622. What stays is a (c) gate: a re-made clone node in a hole instance whose
      recorded type is open.
    - `monoHoleFnPinTy`, which reads the elaboration's default fill.
  - Deleted: `monoLetAnnTyOf`. Built answering as a loud refusal, a fixpoint sweep moved no
    program and every filed witness graded as filed.
  - Blocked:
    - `monoClosedFieldValTy`, records of functions. Its switch (#6636) read the checker's type
      after mono's walk had re-recorded it closed. Before the walk all 8 of its decisions are open
      to both the elaboration and the checker, so the "8 of 8" was mono's answer read back. It is
      mono's own derivation again, and waits on the function-holding fact below.
    - `monoLetWriteRhsTyRec`, with `monoLetWriteRhsTy` and `monoLetWritesRecord`. All 18
      decisions are records holding hole functions written into a `let`, the fact
      `monoClosedObjLitTy` waits on.
    - `monoCbFnListRowSpell`. Its receiver is a nested list of hole functions, open to both the
      elaboration and the checker. That is the holder fact `monoBoundFnListElemsTy` waits on.
    - `monoModuleDupPin` and `monoModuleLetPin`. They spell module bindings by their registry
      names, which waits on the owner's naming-rule question.
  - `monoBindSeededTyParams` (call param) also stays. In its 5 open decisions a generic function
    value is closed by the calls made on it inside the instance, the identity-typing question.
- [ ] **slot type** (27): `monoBindingAdoptInit` 9,578, `monoHoleGenFnPin` 7,952, `monoListSrcElemTy` 7,925, `monoReachLitTys` 6,959, `monoReachSlotTy` 6,938, `monoPinMapValues` 6,754, `monoPinFieldContainers` 798, `monoPinRecordFields` 733, `monoLetWritesClosed` 703, `monoPinObjFields` 695, `monoRetypeLamCells` 565, `monoPinRecordField` 466, `monoWritesCoercedFirstCall` 454, `monoPinNestedListElems` 315, `monoPinFieldContainer` 112, `monoPinMapSlot` 66, `monoLetWritesAt` 57, `monoNoteBindCall` 28, `monoPinFieldValue` 25, `monoPinJoin` 22, `monoPinStoredRecords` 20, `monoRenameInitAt` 12, `monoSigJoin` 3, `monoPinnedElemAnnTy` 2, `monoHandWrittenLet` 2, `monoPinMapNestedFnLists` 0, `monoWrittenLetRetsDisagree` 0.
  The slot pins against `elabSlotTyAt` (2026-11-07, 23,384 programs): map values (the fallback
  where the slot fact declines) agree 32, differ 0, mono only 15; a record's whole type agrees 6,
  differs 0, is mono only 1 and elaboration only 89; a record's function field agrees 15, differs
  0, is mono only 41 and elaboration only 1, with mono pinning nothing in 407. The mono-only side
  is no missing fact: a slot fact is recorded only for a value holding an open function, and the
  41 fields are closed in the checker, whose type is the fact. All 57 mono-only programs build the
  same bytes without mono's pin. The pin itself is not neutral: dropping the record-field pin
  outright moves 5 programs, 3 to a refusal, all records of generic functions, so it is load-bearing
  where the elaboration has a fact (`objects/records-of-generics-at-two-types-into-one-narrower-param.vl`,
  `objects/record-generic-field-called-and-read-under-is.vl`,
  `objects/const-record-field-of-generic-called-direct-and-read-under-is.vl`, D6702, D15447). The
  pins' helpers (`monoDeclPathPins`, `monoPinFnParamTys`, `monoValueAtAnnTy`) are shared, so moving
  the decision deletes nothing.
  The tail is not easy either. Reach on master: `monoNoteBindCall` 8,697 programs,
  `monoPinFieldValue` 115, `monoLetWritesAt` 49, `monoSigJoin` and `monoPinJoin` 24 each,
  `monoPinStoredRecords` 16, `monoRenameInitAt` 13, `monoHandWrittenLet` and
  `monoWrittenLetRetsDisagree` 2 each, `monoPinnedElemAnnTy` and `monoPinMapNestedFnLists` 1 each;
  none is zero-hit. Made to decline, the four smallest each refuse the fixture written for them:
  `monoPinnedElemAnnTy` (`closures/hole-fn-list-reached-through-alias-called-in-callback.vl`,
  `call to unknown function`), `monoHandWrittenLet` with `monoWrittenLetRetsDisagree`
  (`closures/alias-of-written-let-handed-to-generic-fn-param.vl` and
  `closures/written-let-of-hole-fns-to-generic-fn-param.vl`, `unsupported argument type`), and
  `monoPinMapNestedFnLists` (`closures/hole-fn-nested-list-map-value.vl`, `unsupported map value
  type`). Each goes only with an elaboration fact for its shape.
- [ ] **lambda sigs** (11): `monoPinBodyLambdasRaw` 9,023, `monoPinMapLambdas` 9,016, `monoNoteBindDeliveryCall` 6,903, `monoCloneLambdaSubst` 1,259, `monoPinLamFromCheckedTy` 1,111, `monoLamSubstParams` 931, `monoLamParamPinAnn` 797, ~~`monoLamReachParamTy` 124~~, ~~`monoRecvParamElem` 41~~, `monoDeliverLamLit` 6, ~~`monoLamInstSigs` 2~~.
  The hub is `monoLamParamPinAnn`: an un-annotated lambda parameter's pin is the checked type
  substituted at the instance binding. Shadowed (2026-11-07, 23,384 programs, 748 reaching it)
  against three elaboration readings: `elabLamParamTy`, `elabLamDeliveredParams`, and the
  parameter of `elabNodeTy(lam, elabWalkTop())`. Where mono's pin closes, the node type agrees in
  600 notes and the other two in 75, none differs, and 25 programs have no elaboration answer.
  `elabLamParamTy` misses most of them because a built-in `.map` / `.filter` callback has no
  callee call. The node type is only right where the parameter rides this instance's own
  binding: taking it where mono stays open (another declaration's variable, typed per call) gives
  check-clean invalid wasm in 8 programs, which are regression cells for the switch
  (`functions/hole-lambda-literal-two-instance-types.vl`, `generics/nested-capture-per-pin-clone.vl`,
  `closures/hole-fn-list-handed-two-sets-lists-beside-a-wider-read.vl`,
  `closures/hole-param-alias-call-delivers-lambda-at-callee-type.vl`,
  `closures/hole-fn-list-map-result-returned-from-param.vl`, D5931, D12235, D14729).
  Dropping mono's answer in the 25 leaves 19 printing the same and loses `runs` in 6, in two
  shapes:
  - A built-in callback over a list of hole functions read through a hole parameter
    (`function take(a) { return a.map((f) => f(3)) }`, 5 of the 6). The checker types the
    callback `(_) => _` and mono pins `f` at `i32`, the hole list's tag rep, through
    `?take.0 = i32[]`. The missing fact is the TYPE of the holder at the instance,
    `((i32) => i32)[]`, which split-dep's hole-lambda holder closure builds (hole parameters are
    its step c). The pin then reads that type and spells the tag rep where its set is tagged
    (`fnTagRepTyIn`), since a function's type is never `i32`.
  - A lambda written into a captured cell from a closure inside a generic body
    (`closures/captured-cell-shared-writer-hole-lambda-alias.vl`, 1 of the 6; 16 more are output
    neutral). Mono binds the lambda's own hole per instance (`?#L22.0`), and the elaboration has
    no instance key for that lambda (`elabKeyAt` -3). This is the per-instance identity residual
    (4b-i): mono keeps that arm until the key exists.

  `monoRecvParamElem` is switched: the callback's element is the receiver's closed element at the
  walk top, which agreed in all 26 decisions (13 programs), with 0 byte diffs over 19,316 programs.
  `monoLamInstSigs` is deleted. Its one reader, `monoRenameInitAt`, checked after minting a
  lambda's instance at a signature that some instance carries it. That held in all 4 programs that
  reach it, so the check now asks the instance just minted and refuses loudly otherwise. The
  refusal fires 0 times over the corpus. `monoDeliverLamLit` decides no type: it re-instances a
  hole lambda literal already pinned at another signature, once per call it is handed to. That
  happens in 6 programs, the same literals-at-two-types the hub's regression cells name, and its
  refusal is reached by none. It is class (c) mechanics over mono's own instance registry, and
  goes with that registry, not with a fact.
  The signature it pins at is the elaboration's (#6678), and it keeps the destination's spelling
  wherever the parameter types agree, because the registry keys a literal's instances by spelling:
  respelling `(f64)=>f64` as `(f64) => f64` split one literal into two instances (8 outputs, 1 build).
  A literal neither closes, written into a binding's slot, takes its parameters from that slot's
  fact (`elabWrittenSlotTy`, the write noted in `elabRun`): 10 decisions in 6 programs, 10 agree.
  In 9 of them the destination's result is `void` and the slot's is the lambda's own. A `void`
  destination discards the result, so the delivery signature's result is the destination's: a
  signature-versus-identity difference, not a defect, and the switch keeps it. The 6 written
  literals with no slot fact are per-instance (a `let` or record of lambdas in a generic body
  instanced at two types) and stay with the per-instance identity residual above.
  **Grading a shadow.** A row agrees only when the two types are `tySame`. The spelling goes in
  a column of its own. Two types can print alike and still differ (a record built at one row and
  bound at another, as in D14426), and the same type can be spelled two ways (union row order, a
  structural twin's name). Grading by spelling once hid D14426's runs→not-runs inside an
  "agrees" count. Check a switch with a byte sweep on fixpoint seeds before believing either column.
  **The six non-hub helpers, shadowed (2026-11-07, Fn#d, 19,337 programs).** Each decision was read
  against the lambda's parameters in `elabNodeTy(lam, elabWalkTop())`, and the bind site also
  against the delivered name's slot fact and `elabLamDeliveredParams`.
  - `monoLamSubstParams`: an annotated parameter riding a type parameter, substituted through the
    binding. 244 rows, 244 agree by type. Switched: the parameter takes the elaboration's type,
    spelled by `monoPinNominalSpelling` as the binders spell it (`monoPinAnnSpelling` gave `string |
    null` and a row name in 5 programs and lost 3 `tests/cases` runs), and a substitution spelled
    otherwise refuses. `monoSubstAnnNode` stays as the classifier (no type parameter, or one this
    instance cannot bind) and for its two other callers, `monoCloneLambdaSubst`'s return step and
    `monoSubstTyArgNodes`.
  - `monoPinMapLambdas` waits. Its element is already the elaboration's (`monoRecvParamElemTy`), and
    what is left is the clone. Of 1,017 rows mono clones in 64: 45 agree, 10 read `T` or `_` at the
    walk top and 9 have no answer, so switching needs the callback's parameter read per instance.
  - `monoNoteBindDeliveryCall` waits. A named hole lambda is pinned at the signature it is delivered
    at. Over 219 rows the name has no slot fact, and `elabLamDeliveredParams` agrees in 43, spells the
    same rep otherwise in 8 (`Dot` for `Circle`, `Z` for `i32`) and has nothing in about 168. It
    needs a delivered-signature fact for named hole lambdas.
  - `monoPinBodyLambdasRaw` and `monoCloneLambdaSubst` are the instance body's clone walk; their
    type decisions are the substitution above and the hub.
  - The hub (`monoLamParamPinAnn`) waits on split-dep's holder fact (c2) and on the per-instance
    identity residual (4b-i), as above.
  - Node type, gated on (c2) (#6593): `monoInitHeldTy` answers only adopt-init's mono-only holders,
    and `monoRetFnListTy` / `monoBoundFnListElemsTy` answer 15 returned or nested lists of hole
    lambdas whose type and instance result the elaboration leaves absent or `(_) => _`.
  - **The holder acceptance list, after (c2)** (2026-11-07, master `18d3d488`, the full population).
    (c2) moved adopt-init from 21 to 34 agreements and nothing else in this set. What stays
    mono-only is one population, 239 decisions in 78 files, sent to split-dep as the acceptance list
    for the next holder fact:
    - 161 `monoBindingAdoptInit` bindings: nullable functions (`((i32) => i32) | null`, 37), function
      lists and capture cells (`((i32) => void)[]`, 26 and more), bare hole functions (23), records
      of functions, and bundle records (`{f: {c0: …, c1: …}}`, which may be reach's bundle fact);
    - 15 returned or nested lists of hole lambdas (`monoRetFnListTy` / `monoBoundFnListElemsTy`);
    - 63 `monoArgClosedTyIn` arguments outside an instance that the checker leaves a hole function.

    Each is a function-valued holder whose closed signature comes from its own calls, which the held
    slot's fallthrough does not reach.
  - **The let and list-callback node types** (2026-11-07, master `18d3d488`, the full population).
    - `monoSubstLetType` (and `monoCloneLetDecl`, which only wraps it) stays. Its substituted type
      against `elabWalkTy`: 1,022 of 1,058 agree, 31 are open on both sides, and 5 are not the same
      type though they print alike. One of the 5 is D14426's witness
      (`hole-instance-typed-at-binding-stored-at-build`). There the binding takes the checker's
      instance binding and the elaboration gives the build. Switching the type to the elaboration
      turns that program from running into a loud emit reject. One agreement also gains `readonly`,
      which moves bytes but not output. The SPELLING cannot switch either. In 104 of the agreements
      (74 files) the elaboration's nominal spelling differs from the substituted name: union row
      order, `Dot$mN` for `Circle$mN`, `{x: i32}` for `P`, `#anon1` for a record. That name is the
      union registry's key (D2676).
    - `monoCoerceListCbArg` stays. The elaboration never contradicts it, but is absent for 515 of
      1,691 receivers (`elabNodeTyAt(memObj)`) and for 92 of 122 callback signatures, and open
      (`(T) => T` where mono closes the instance) for 18 more. That is the second acceptance list:
      a receiver fact for list methods called on a list of hole lambdas, and a delivered-signature
      fact for a lambda or function value handed to a list method as its callback.
      Re-graded against the checker's own closed type, 424 of those decisions read the checker
      and owe nothing. What is left is 166 receivers (122 function-list holders, the holder fact's)
      and 63 callback signatures. A named generic or hole callback now takes the signature of the
      instance the elaboration made for it at the element (`elabCbArgSig`, noted against the
      argument). So does one a binding holds (`const inc = (a) => a + 1`, which the checker now
      instances through `cwFnValueDeclOf`) and a choice of functions whose arms agree. That
      covers 44 of the 63 with 0 DIFF and builds all 19,337 programs byte-identical. The other
      19 are hole-lambda lists left open on both sides, a binding written more than once, and a
      choice inside a generic instance.
      `monoCoerceListCbArg` is deleted only when both its halves read the elaboration. Its
      receiver half (166 decisions, every one a list of hole functions closed by its own calls,
      returned, held or nested) waits on the holder fact. Its callback half waits on what that
      fact and the binding reader leave of the 19.
- [ ] **instance binding** (34): `monoHoleBinding` 9,023, `monoMakeInstanceGo` 9,023, `monoBindCols` 9,020, `monoMakeInstanceLetTyCol` 9,020, `monoCadNoteInstance` 9,017, `monoNicheNulParamsCheck` 9,013, `monoBindBareUnionArm` 8,993, `monoBindNullArm` 8,980, `monoSlotParamPins` 8,714, `monoPreBindPastUnionRest` 8,710, `monoInstantiateCallIn` 8,710, `monoLetTyParamMisfit` 8,701, `monoExactPinTyOf` 8,679, `monoPinAnnotatedParam` 5,749, `monoNicheNulListCheck` 5,704, `monoParamPinnedNull` 5,486, `monoPreBindPastEmptyLit` 5,305, `monoPoisonSharedPins` 2,705, `monoBindInnerUnionArms` 1,804, `monoExactBind` 1,275, `monoLetSeedMisfits` 1,250, `monoSubstAnnNode` 1,223, `monoPinnedTyParamCanon` 1,001, `monoInstParamPinTys` 472, `monoPinTyParamComposite` 427, `monoLitElemPin` 238, `monoBindEnclosingPins` 138, `monoBindBareArenaPins` 104, `monoSubstTyArgNodes` 47, `monoPreBindNonArrowArgs` 46, `monoBindFromLaterArg` 3, `monoLayoutConstOf` 0, `monoSeedCallSigTys` 0, `monoSlotSig` 0.
  The hub is the binding `monoInstantiateCallIn` hands `monoMakeInstance` (`tvN` / `tvV` / `tvT`),
  against `ekTys` at the key the elaboration made for the call (`elabWalkKeyOf`, which already
  keys the instance). Shadowed (2026-11-07, 23,384 programs) where the binding is final, by type
  (same type or same representation): agree 4,978 programs, differ 20, mono only 13, elaboration
  only 9, neither 92 (mostly function-signature pins left open on both sides), and 10 more where mono
  holds only a spelling. Switched: a closed elaboration binding replaces a closed mono binding of
  another representation; one of the same representation keeps mono's spelling, and one mono
  leaves open or unbound stays mono's. The 20 differ programs print the same output and build the
  same bytes either way, because the value reaches nothing that lowers: the pins and the
  elaboration-keyed instance key carry it. They are the cells a later producer deletion has to keep
  byte-identical, and they are re-graded by output at each one:
  - a declared record against the literal's own shape (`V` / `{y: i32, x: i32}`, `Circle` /
    `{r: null}`, `Circle` / `K`, `J` / `{f: i32}`): `modules/overload-generic-fresh-binding-runs`,
    `soundness/mixed-instance-unrelated-arguments-runs.vl`, `soundness/mixed-instance-list-reach-runs.vl`,
    `soundness/fresh-literal-at-generic-placed-in-wider-field-runs.vl`,
    `soundness/fresh-literal-at-generic-delivered-wider-runs.vl`,
    `soundness/bound-record-built-wider-at-unpinned-generic-runs.vl`,
    `generics/hole-instance-typed-at-binding-stored-at-build.vl`, named `d15172_viafield` and
    `d15172_listviafield`, D14760, D15184, D15210;
  - a map mono leaves holed (`{[_]: _}` / `{[string]: i32}`): `generics/empty-map-to-bare-type-parameter.vl`, D1887;
  - `void` or `null` against `never`: `functions/never-function-value.vl`,
    `functions/never-generic-pin-traps.vl`, D3178;
  - `i32 | null` against `i32`: `generics/recursion-at-same-type-runs.vl`, D14581;
  - a literal union whose two renders print empty: `literal-unions/one-literal-list-container-generic.vl`.

  `monoPreBindPastEmptyLit` and `monoPreBindNonArrowArgs` bind from the elaboration's key, and
  `monoBindFromLaterArg` is deleted. Their shadows: the empty-literal pre-bind agrees in all 3
  programs that reach it, and the non-arrow pre-bind agrees in 40 of 46, binds nothing in 5, and is
  mono only in 1 (`closures/fn-value-generic-nullable-fn-param.vl`), which prints the same without it.
  `monoBindBareArenaPins` is deleted: a bare type parameter's arena binding (D2734) reads the same
  key. It adds a binding in 23 programs; 19 agree, none differ, and 5 are mono only, a generic handed
  as a value whose call key declines. Those 5 build the same bytes without mono's pin and join the
  cells above: `generics/declared-generic-to-two-hole-params-null-at-each.vl`,
  `generics/hole-call-of-generic-at-its-own-instance.vl`, `closures/fn-value-generic-nullable-fn-param.vl`,
  D14582, D6541. `monoBindEnclosingPins` decides nothing: the enclosing pins it registers come from
  `monoEnclosingPinRow`, which reads the enclosing instance's key (`ekNames` / `ekTys`), so it is
  class (c).
  `monoLitElemPin` is deleted: D2816's clash rung names the pinned element of a template list
  literal typed `X[][]` from `elabNodeTy` at the instance being walked, which agrees in all 4
  programs that reach it. The clone-time columns it alone read (`monoCgcBN` / `monoCgcBT`) go
  with it.
  `monoInstParamPinTys` (the parameter types of a minted instance, for the written-cell coercion)
  reads `elabParamTyOwnAt` at the instance's own key, and the clone column it read
  (`monoInstParamTyCol`) is deleted. It agrees in 436 programs and differs in none. In the 7 it alone
  answered, the instance builds the same bytes without it, and they join the cells above:
  `unions/function-arm-reassign-after-narrow.vl`, `inference/unannotated-param-solved-composite-and-nested.vl`,
  `lists/unannotated-list-fn-value-dest.vl`,
  `closures/lambda-called-directly-with-generic-at-two-signatures-beside-one-signature-consumer.vl`,
  `closures/closure-result-nullable-closure-array.vl`, `functions/hole-call-let-lambda-at-two-instances.vl`,
  D14824.
  `monoExactBind` (the exact binding a type-testing body keys its instance by) takes `ekTys` at the
  call's key, which `monoMakeInstanceGo` now computes before the registry key; the walk it replaced
  (`exactBindWalk`, `monoTyIsOpenUnion`) is deleted. It agrees in 938 programs and differs in none,
  and the 2 it alone answered build the same bytes without it:
  `objects/record-literal-arg-generic-field-read-under-is.vl`, D6701.
  The family is closed as far as it goes. What moved: the hub binding, the two pre-binds, the bare
  arena binding, D2816's clash pin, a minted instance's parameter types and the exact binding all
  read the elaboration's key, and five helpers and three clone columns are deleted. What stays:
  `monoPinnedTyParamCanon`, the pin-implied dedup of the key text, which decides instance identity
  and waits on the canonical instance key (measured there); `monoPinTyParamComposite` and
  `monoPinAnnotatedParam`, which are Fn#d's call-param hub; and the class (c) mechanics that make,
  key, register and clone instances (`monoMakeInstanceGo`, `monoInstantiateCallIn`, `monoBindCols`,
  `monoMakeInstanceLetTyCol`, `monoCadNoteInstance`, `monoSlotParamPins`, `monoSlotSig`,
  `monoSubstAnnNode`, `monoSubstTyArgNodes`, `monoLayoutConstOf`, `monoSeedCallSigTys`,
  `monoBindEnclosingPins`).
  The per-argument pins are a separate fact (the argument's representation, per union arm) and
  wait for the producers.
- [x] **literal arm row** (5): `monoNoteLitDest` 8,956, `monoNoteLitDestIn` 4,887, `monoNoteListLitDests` 16, `monoVariantRowAmong` 3, `monoArgOwnVariant` 0 — deleted; the elaboration records the union a call hands a literal back into (`litRetUnionIx`, read by `litRetArmRow`).
- [ ] **value returns** (7): `monoFlowRetVals` 8,077, `monoFlowConstCallArgs` 8,064, `monoFlowAnnLits` 6,049, `monoDeliverCallRets` 1,021, `monoFlowCallLeafAt` 175, `monoIfBoundRetAtPin` 24, `monoFlowCallLeaf` 0.
- [x] **instance result** (10): ~~`monoRetRecordOf` 8,023~~, ~~`monoRetRepOf` 7,745~~, ~~`monoPinCallRecord` 6,765~~, ~~`monoPinInPlaceCallRecord` 6,763~~, ~~`monoReturnedBundlePin` 6,538~~, `monoPinnedRetAnnTy` 505 (switched, #6511), ~~`monoCallInstRetTy` 205~~, ~~`monoRetConstRecord` 66~~, ~~`monoInstRetLitTy` 34~~, ~~`monoInstAnnRetTy` 26~~. #6498 deleted the record-pin four, #6511 the instance-literal pair, and the delivered-rep fact the rest (below).
- [ ] **walk type** (33): `monoExprRebuild` 7,470, `monoPinRetype` 7,368, `monoPinnedTyOf` 6,521, `monoElseRemainderAt` 6,167, `monoPinFnValueTy` 4,955, `monoPinRecvName` 3,289, `monoPinRecvLit` 3,162, `monoPinCoalJoin` 2,708, `monoIfChainRebuildPinned` 2,654, ~~`monoIfArmsAllTy` 2,641~~, ~~`monoHoleJoinPinsString` 2,368~~, `monoPinMemberCall` 1,241, `monoLamPinRetAnn` 1,112, `monoNumUnionOpPin` 788, `monoPinCoalListDefault` 781, `monoHoleNodeTy` 686, ~~`monoArmTailIsTy` 643~~, `monoLamCallTy` 522, `monoHoleCoalUnion` 321, `monoHoleTy` 252, `monoNumOperandPinTy` 241, `monoPinArmSubst` 124, ~~`monoIfArmsPinJoin` 86~~, `monoChainPinnedTys` 74, `monoHoleJoinDropsArm` 72, `monoTpJoinObjTy` 54, `monoSubstIsExpr` 53, `monoHoleBindingOf` 24, ~~`monoHoleJoinPinTy` 11~~, `monoArmPinnedTy` 5, ~~`monoHoleJoinHasAtomArm` 1~~, `monoNumUnionCompoundPin` 1, ~~`monoArmPinsLitUnion` 0~~.
  The hub is `monoPinnedTyOf`: the recorded type substituted at the binding, which most of the
  family reads. Shadowed against the elaboration's closed type at the instance (`elabWalkNarrowedTy`,
  else `elabWalkTy`) over 23,384 programs, 6,163 reaching a node whose recorded type names a
  variable (per program, answer and node kind): agree 4,487, differ 58, mono only 151, elaboration
  only 6,855, neither 1,413. Graded by output: taking the elaboration's answer in every differ cell
  leaves 45 of 46 programs printing the same, and the one that moves is
  `generics/filled-string-literal-typed-by-literal-union-destination.vl`, where mono's `i32[]` for a
  `(1 | 2 | 7)[]` list works around [D3540](../inventory/D3540.md) (a numeric literal union is its base
  only in a field slot, D611). Switched: where mono's pin closes, the elaboration answers, except
  that list. Against a master fixpoint over 19,316 programs, 2 byte movers
  (`closures/hole-fn-generic-map-handed-two-maps.vl`,
  `functions/hole-param-lambda-open-map-result-pinned-by-callee.vl`), both printing master's output.
  The mono-only cells stay with the lambda-sig family: dropping mono's answer there leaves 53 of 59
  programs printing the same, and the other 6 already refuse and change only their message
  (`closures/listed-hole-fn-written-param-reject.vl`, `closures/listed-hole-fn-escaping-list-reject.vl`,
  D15010, D15011, D15483, D1666). The elaboration-only cells are mono's decision not to retype.
  The rebuild helpers (`monoExprRebuild`, `monoPinRetype`, `monoPinFnValueTy`, `monoPinRecvName`,
  `monoPinRecvLit`, `monoPinCoalJoin`, `monoPinCoalListDefault`, `monoTpJoinObjTy`,
  `monoIfChainRebuildPinned`, `monoNumUnionOpPin`, `monoNumUnionCompoundPin`, `monoPinMemberCall`,
  `monoSubstIsExpr`, `monoHoleCoalUnion`) remake syntax and consume a type: class (c) once their
  type reads the elaboration, which through the hub it now does where the pin closes.
- [ ] **call param** (13): `monoBindSeededTyParams` 5,624, `monoArgTyName` 5,220, `monoPinHoleParam` 3,734, `monoCallIfValue` 2,887, `monoArgPinTyIx` 404, `monoArgTyNameCascade` 360, `monoArgTyNameRep` 215, `monoArgTyNameBound` 177, `monoSpelledRecordLeavesRow` 127, `monoPreBindArgName` 63, `monoPreBindArgTy` 63, `monoArgPinName` 61, `monoArgTyNameProjected` 9.
  **`monoArgTyName`, shadowed** (2026-11-07, master `1cebe3ff`, the full population, 14,974
  decisions). Each is graded against the argument's own type at the instance: `elabNodeTyAt`,
  else the root walk's, else the checker's. Agreement is `tySame`; spelling is a column of its own.
  - The closed rung (`monoArgClosedPin`, 14,394) already pins at that type.
    - 12,893 agree, 11,384 of them through the checker's type where the elaboration declines at
      the root.
    - 1,403 bank the template's `T` beside a name that is already the closed type's spelling.
    - 82 differ by design. 80 are records built wider at delivery, which pin at the build
      (`elabArgBuiltRep`, `recCopyTyOf`; D15181, D15183). 2 are a hole call of a generic at its own
      instance, where the elaboration's `f64` is right.
    - What mono owns is the spelling: 328 registry names (`P` for `{x: i32}`, `#anon0`).
  - The cascade (580) is type = elaboration; spelling = row key; waits on row identity. In a
    generic clone the elaboration gives a declared record argument its structural type, and the
    closed rung's spelling declines a record spelled by its fields, so it matches 3 of the 580.
    Its rungs, by answers:

    | rung | reads | answers | nominal spelling eq / ne / open |
    |---|---|---|---|
    | `monoArgTyNameRep`, struct row (`sNames`) | the row name | 167 | 25 / 127 / 15 |
    | `monoArgTyNameBound`, a module global's annotation | the annotation | 109 | 103 / 2 / 4 |
    | `monoArgTyNameRep`, list literal (`arrLitElemName`) | the element | 108 | 31 / 51 / 26 |
    | `monoArgTyNameBound`, a parameter's annotation | the annotation | 49 | 22 / 18 / 9 |
    | `monoArgTyNameBound`, a generic application's inner | the annotation | 47 | 13 / 32 / 2 |
    | `monoArgTyNameRep`, a union variant (`litRetArmRow`) | the variant | 28 | 19 / 9 / 0 |
    | the cascade's function value and `""` floor | the signature key | 19 | open |
    | `monoArgTyNameRep`'s tail, `ELAB_TP_DEFAULT` by name (D23) | the default | 11 | open |
    | the rest | | 42 | |

    No rung goes through `monoPinNominalSpelling`: each big one has rows it spells otherwise,
    and a switch would rekey the instance. Its literal returns are rep names, not defaults: the
    scalar and list floors (`"string"`, `"f64[]"`, `"i32[]"`, …) name the rep an `expr*` test
    found, and the `i32[]` list floor is reached by no program.
  - `monoBindSeededTyParams` makes 21 decisions over the population where `elabCallSeedBind`
    answers. 1 agrees, 15 are open on both sides, and 0 differ. In 5, mono closes the type (for
    example `(string) => string`) where the elaboration's seed binding is the seed parameter's own
    `(T) => T`, because mono substitutes the binding that parameter got at the instance.
  - `monoCallIfValue` makes no decision over the population: every entry returns at its gate.
    Built with its signature step as a loud refusal, a fixpoint sweep moved no program and every
    filed witness graded as filed, so the step is deleted. With it go `monoSeedCallSigTys`,
    `monoInstFnPinTys` and the `monoWrittenLetSigCall` flag. What stays is class (c): a gate that
    recognises a call through an `if` naming generic functions in every arm, and refuses it with
    "a call through an `if` naming generic functions in every arm has no signature to instance
    them at".
  - `monoPreBindArgName`, `monoPreBindArgTy`, `monoArgPinName` and `monoArgPinTyIx` wrap the pin
    measured above. `monoSpelledRecordLeavesRow` is a row-layout test, in the row-key family.
- [x] **uncalled slot** (6): `monoInertParamStubPin` 4,712, `monoValsInert` 12, `monoCallRetsInert` 12, `monoValsReachNoCall` 8, `monoLitReachesNoCall` 0, `monoInertReach` 0.
  The type an uncalled slot holds its functions at is the elaboration's (`elabUncalledSlotTy`,
  from `elabSlotHeldFns`), read by `monoUncalledSlotFnTy`. Shadowed over 23,381 programs, 507
  decisions in 318 programs: 105 agree, 401 decline on both sides, 0 disagree. In one, D12218,
  the elaboration answers where mono declines; a held value whose checked type is no function
  type keeps it declining. What is left mono-derived is the gate deciding the slot is uncalled.
  Before #6503 gated the stored slot on `elabSlotUncalled` alone, 59 of the 105 reach the default through `monoValsInert`, `monoValsReachNoCall` or
  `monoLitReachesNoCall` while `elabSlotUncalled` says the slot is called. That calledness
  disagreement, shadowed at the four gate sites on 2026-11-06, is 53 decisions in about 31
  programs where mono says uncalled and the elaboration says called: 23 at the flat list with no
  pins (`monoLitReachesNoCall`), 28 at the stored slot and 2 at the pushed list (`monoValsInert`).
  `elabSlotUncalled` now counts no call whose callee names a function or is a const element read
  naming one (`fnSlotThroughCalls`, `elabCallNamesOne`), which moves 22 of the 23 to agree with no
  new disagreement. The 31 left, the pushed-list and stored-slot ones and one call through a list
  of one lambda, are the calls the `monoFlowReads` rewrite repoints, which the cad lane records
  after B2; then `monoLitReachesNoCall`, `monoValsReachNoCall` and `monoValsInert` go.
  `monoInertParamStubPin` stays, measured on 2026-11-07. Over 23,384 programs, 10 reach its
  inert check. Its input, `vrInertFor("mono", …)`, agrees with `vrValueInert` on all 10: 8 not
  inert and 2 inert. A compiler that never takes the pin builds the 8 byte-identically, and moves
  the 2 inert ones from runs to a loud `monomorphize: unsupported argument type for \`f\``:
  `closures/uncalled-hole-fn-inert-uses.vl` and D6910. Those two programs are what the pin
  carries. Switching its input deletes nothing, because `monoPrimeInert` and `monoReachIndex`
  also call `vrInertFor("mono", …)`.

The unbound default, which every program reaches through `monoElabDefaultsPrime`, is the reach
lane's. The cad lane takes slot deliveries, then node type, then slot type.
