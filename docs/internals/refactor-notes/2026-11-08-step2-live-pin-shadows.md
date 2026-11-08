# Step 2: the live `mono*Pin*` functions by family, and two shadows that do not switch

Base: master `e1361fa4` with #6889 merged, built to a fixpoint (6,576,217 bytes). Population: the
23,724 programs of `scripts/sweep.vl -- list`, each built once with `$VL_REP_SHADOW` by a scratch
seed that was never committed. Counts are pin answers, not programs.

## Families (emit_mono.vl, 171 functions matching `mono\w*Pin`)

| family | the question | examples | home |
|---|---|---|---|
| argument pin | the name and type an instance is keyed by at one argument | `monoArgPinTyIx`, `monoArgClosedPinTy`, `monoNarrowed*PinName`, `monoBuildTyPin` | the call key; most callers are lanes w162/w167's and `monoPinTyParamComposite` |
| closed-type spelling | the pin string of a closed type | `monoClosedTyPin`, `monoPinOfClosedTy`, `monoRecordRowPin`, `monoFnTyPin`, `monoPinAnnSpelling` | `monoPinSpellOf`; the spellings differ by design (union order, `=>` sig keys, row names), see `tests/vl_pin_spell_shadow_test.ts` |
| body retyping | the instance type of a node in a cloned body | `monoPinBinOps` and its arms, `monoPinnedOperandTy`, `monoPinnedTyOf`, `monoPinRetype` | `elabNodeTy` at the walk's instance |
| lambda pins | a lambda's parameter and return types at its delivery | `monoPinBodyLambdas`, `monoPinLamAtTys`, `monoLamPinRetAnn` | the delivery's recorded type |
| type-parameter binding and key | the instance's binding columns | `monoPushPins`, `monoExactPinTys`, `monoKeyPinSeg`, `monoBindEnclosingPins` | the call key's binding |
| record and container rows | which record row a field, element or slot is built at | `monoPinSlotRecords`, `monoPinListRecords`, `monoPinMapSlot`, `monoPinStoredRecords` | a rep decision: `repOf(ty)`, step 7 |
| union registration | registering a value-union box at a pin | `monoPinUnionBoxed`, `monoRegisterPinUnion`, `monoPinMintedUnion` | a rep decision: `repOf(ty)`, step 7 |
| function values | a function value's signature at a hole | `monoElabPin`, `monoFnPinAt`, `monoHoleGenFnPin`, `monoBundle*Pin*` | the call key plus the coercion |
| delivery and return | the type a value is coerced to where it is delivered | `monoDeliverAtPinTys`, `monoCoerceRetAtPin`, `monoPinCallRet` | the recorded delivery type |
| refusals | the `emitFail` arms | `monoFwdFnPinFail`, `monoHoleTwoPinsFail`, `monoCoalDefaultClashesPin` | stand while their refusal does |

## Shadow 1: body retyping, `monoPinnedOperandTy` against `elabNodeTy(ix, elabWalkTop())`

| class | answers |
|---|---|
| same type index | 5,105 |
| `tySame` | 731 |
| differ | 109 |
| elaboration open | 57 |
| elaboration has none | 8 |

The pin answers the parameter's declared type. The elaboration answers the read's own type,
narrowed: `string[]|null ~ string[]` and `{f:()=>i32}|null ~ {f:()=>i32}` are reads under a null
guard, and `{y:i32,x:i32|string} ~ {y:i32,x:i32}` is a field narrowed by the guard. The 27
`i32 ~ i32` rows are two distinct types that print alike (D9620's witness and the `d492_and_numunion`
named cells). The pin's consumers (the `??` fold, the dead null test, the D511 operator dispatch) are
sound at either answer, but the narrowed one folds more, so a switch changes modules. That is a
change of what the pin means, not a deletion. It stands.

## Shadow 2: argument pin, `monoArgPinTyIx` against `elabNodeTyAt(ax, fnIx)`

| class | answers |
|---|---|
| same type index | 3,908 |
| `tySame` | 356 |
| differ | 3,552 |
| elaboration has none | 35,243 |
| elaboration open | 15 |

The elaboration has no per-instance node type for most arguments, because the caller is not an
instance. Of the differ rows, the most common shape banks an open `T` where the elaboration closes
it, which every caller then closes with `monoPinSubTyOf`. Its callers are in `monoPinHoleParam`,
`monoPinAnnotatedParam` and `monoPinTyParamComposite`, so the switch belongs to those lanes. The
fact to compare there is `monoPinSubTyOf(monoArgPinTyIx(x, ctx), ctx)`, not the bare pin.

## Deleted

Nothing. Neither family agrees everywhere, and the families that would switch next (lambda pins,
delivery types) need their own shadow first.
