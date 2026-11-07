# emit_mono's decision arms: the coverage probe and the queue

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4, opening on 2026-11-07; its `§` references are to that file.

### 3.4 emit_mono's decision arms, measured (2026-11-05)

A coverage probe counted, per program, every `if`/`else` body in `emit_mono.vl` at master f0caaf0:
5,575 arms, over 23,810 programs (every `tests/cases` file, the distilled corpus, every filed
witness in both inventories). The counter was validated on `monomorphize`'s own arms before any zero
was read. A *decision arm* records a node type (`nodeTyRecord`, `monoRetype*`, `monoRecordOpen`) or
returns a computed pin; an arm that refuses (`emitFail`, a `*Fail` helper) is a refusal arm.

**Arms are not deleted on zero hits** (coordinator ruling). A dead function's callers are already
unreachable; a dead arm sits in a live function, and deleting it reroutes an unmeasured program to the
next rung. `monoArgTyNameRep`'s scalar tail (`exprIsF64` to `"f64"` and its neighbours) is unreached,
and its cascade ends in `"i32"` (D23): deleting a rung would pin an unmeasured f64 argument at `i32`,
a clause-1 miscompile no corpus program sees. The zero list is a map of what earlier rungs or the
elaboration already decide:

- 46 decision arms with no hit, by function: `monoArgTyNameCascade` (2), `monoArgTyNameProjected`,
  `monoArgTyNameRep` (14), `monoCallWrittenLet`, `monoCapturedDestListPin`, `monoCoerceChoiceBinding`
  (2), `monoCopyCellRead`, `monoHeldRecPaths`, `monoHoleGenFnPin`, `monoInitHeldTy`,
  `monoLoopVarRecordPin`, `monoModuleLetPin` (2), `monoPinCallRecord`, `monoPinFieldContainer`,
  `monoPinFieldValue`, `monoPinOpenCallLams`, `monoPinWidened`, `monoPinnedAnnTyAt`,
  `monoRecordInstOpen`, `monoRecordPinnedRecv`, `monoRetConstRecord`, `monoRetypeCallsAt` (5),
  `monoRetypeLamCells` (2), `monoRetypeMethodReads`, `monoSigFnTyNameAt`.
- 36 refusal arms with no hit, kept: `monoBindExplicitTyArgs`, `monoBindingAtPin` (2),
  `monoBundleNamedPin` (2), `monoBundlePinArg`, `monoBundleRecordTy`, `monoCloCoerceBuild` (2),
  `monoClosureBundlePin`, `monoCoerceWrittenCell` (3), `monoHandWrittenLet` (2),
  `monoIfChainRebuildPinned`, `monoInertArgsStubbed`, `monoInstantiateCallIn`, `monoLayoutConstOf`
  (2), `monoLetTyParamMisfit`, `monoMakeInstanceGo` (2), `monoMakeInstanceLater` (2),
  `monoMakeInstanceParams`, `monoMakeInstanceWalk`, `monoNicheNulListCheck`, `monoOpenCallAtElems`
  (2), `monoPinColsMisalignedFail`, `monoPinHoleParam`, `monoPruneTemplates`, `monoShadowRenameDecl`
  (2), `monoTwoListArgFail`.

**The most-reached decision arms are the next stage's queue**, each to be shadowed against the
elaboration fact that should carry the same answer: `monoWalkIdentCall`'s instance of a generic call
(9,384 programs, D3961), `monoHoleGenFnPin` (7,937), `monoPinNoteReturns`,
`monoNarrowedNominalPinName`, `monoReachListTy`, `monoCloneGenericCallArm` (D12702),
`monoReachRecTy`, `monoCloPinAnnNodeOfExpr`, `monoMakeInstanceGo`'s instance note,
`monoIfChainRebuild`, `monoPinBodyLambdasRaw` (D1990), `monoCloneGenericCalls` (D2849, two arms),
`monoCloneLambdaSubst` (two arms, D943 and seven more), `monoPinLamFromCheckedTy` (now `monoPinLamAtDelivery`; D3820, D3834).
