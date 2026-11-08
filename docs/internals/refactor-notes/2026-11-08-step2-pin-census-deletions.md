# Step 2: the `mono*Pin*` census and the redundant pins deleted

Master `0cfd71c8`, built to a fixpoint. Population: the 23,720 programs of `scripts/sweep.vl -- list`.

## Census

196 functions in `compiler/*.vl` match `mono\w*Pin` (176 in emit_mono.vl, 20 in pin_spell.vl).
Callers come from a scan of every function body, comments stripped. Reach comes from a scratch
probe build, never committed: each pin function marks its name on entry, and the marks are reported
through the late-demands channel over `vl check --batch --json --codegen` of the population in
chunks of 100. The probe was validated first: it marks the pins a known batch of five programs reaches.

| class | before | after |
|---|---|---|
| (a) no caller | 0 | 0 |
| (b) callers only among dead pins (a greatest fixpoint over the pin set) | 0 | 0 |
| (c) live and reached | 189 | 185 |
| (d) live, never reached | 7 | 6 |

The seven (d), and why each stands:
- `monoFwdFnPinFail` and `monoHoleTwoPinsFail` are refusal helpers, called from `monoPinHoleParam`
  (lane w162) and `monoPinAnnotatedParam`. Refusal arms are kept on zero hits.
- `monoPinSpellNote`, `monoPinSpellClass` and `monoPinSpellArms` are the `$VL_REP_SHADOW` pin-spelling
  shadow, graded by `tests/vl_pin_spell_shadow_test.ts`. They are an instrument, and off in the sweep.
- `monoAnonListPinName` is the ref-list literal rung in `monoArgTyNameRep`, which only
  `monoArgTyNameCascade` reaches (lane w160).
- `monoPinnedRetAnnTy` was the Call arm of `monoPinnedAnnTyAt`, and is deleted with it.

## Ablation of reached rungs

A combined ablation was built in scratch: the rung's call removed, or its answer replaced by the
"no answer" the caller already handles. It was swept against the base, then bisected.

| rung | movers | verdict |
|---|---|---|
| `monoPinnedAnnTyAt` in `monoCoerceListCbArg` | 0 | deleted, with `monoPinnedAgree` and `monoPinnedRetAnnTy` |
| `monoNumUnionCompoundPin` in `monoNumUnionOpPin` | 0 | deleted |
| `monoInlineRecPinName` in `monoLamPinName` | 0 | deleted |
| `monoProjectedUnionRowPin`, both sites in `monoArgTyNameProjected` | 0 | not mine: only `monoArgTyNameCascade` reaches it (w160) |
| `monoPinSlotRecords` in `monoSlotRecordsApply` | 16 runs lost | live: bundle records held in a field, list or map |
| `monoCoalDefaultClashesPin` in `monoRetReachesClash` | 2 | live: D12455's `??` default clash refusal |
| `monoLitUnionPinOfTy` in `monoClosedTyName` | 2 | live |
| `monoPinSpellLitUnion` in `monoPinSpellOf` | 2 | live (the residue of that batch once the rung above was out) |
| `monoCloPinTyOf` (`monoArgPinTyIx`), `monoElabFreshLitPin` (first site in `monoElabPin`), the ladder rungs in `monoI32AtomPinName`, `monoClosedTyName`'s union arm and `monoPinFirstDeclOfRow` (`monoPinSpellOf`) | 0 | kept, see below |

What answers the deleted pins: the receiver's elaboration type (`elabIdentityTy`, then
`elabWrittenValueTy`) for `monoPinnedAnnTyAt`; the operand's numeric record (step 5) for the
compound pin; and the type's own spelling (`tyToEmitName`) for the inline record name.

The five zero-mover rungs in the last row are kept. Each sits in a function that stays live
(`monoElabFreshLitPin` has a second, unablated call site), so removing the rung only reroutes a
program to the next rung. The sweep shows that rerouting is byte-identical for every program in
the population that reaches those rungs. It does not show the same for an alias or literal spelling
outside the population. That proof is the next lane's, rung by rung.

## `monoPinTyParamComposite`

A scratch shadow compared the pin it pushes against the call key's parameter type
(`elabCallParamTy` of the call's template, spelled by `monoPinSpellOf`) over all 1,390 composite
pins in the population:

| class | pins |
|---|---|
| agree | 1,372 |
| the key does not close (`(i32)=>i32`, a call inside a hole instance) | 5 |
| the key carries `never` where the pin defaults (`i32[]\|null` against `never[]\|null`, `null`, `()=>void`) | 9 |
| the key has no spelling (`CN<i32>\|null`, `{z:i32}\|null`) | 2 |

Even where the key agrees, the function binds the instance's type parameters (`tvN`/`tvV`/`tvT`) and
runs the function-value coercion (`monoCoerceFnValueTys`), and the key replaces neither. It stands
until the key closes the 16 and the instance's binding comes from the key alone.

## Graded

Fixpoint (a second refresh is byte-identical). Seed 6,580,497 → 6,576,706 bytes (−3,791). Sweep
against the base: 23,720 same, 0 movers of any kind. Pin-helper budget 926 → 921. Export budget
ok: `elabReturnedClosedTy` lost its one reader and is deleted, and `elabLitSlotCallTy` is no
longer exported.
