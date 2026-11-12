# Step 7 L2 §7: a composite parameter's pin is the naming rule's spelling of its closed type, 2026-11-12

`monoPinTyParamComposite` spelled `pinC`, the parameter's pin, by `monoSubstAnn`: the annotation
text with each type parameter replaced by its `tvV` spelling. In
`2026-11-12-step7-l2-mono-subst-ann-callers-measured.md`, taking the rule's spelling of
`substTyDeepOf(patTy, tvN, tvT, own)` lost 4 programs, each refused with "unsupported argument
type". In each, the rule had spelled the type as "":

| cell | `monoSubstAnn` | the substituted type |
| --- | --- | --- |
| D15530 (the `F(null)` instance) | `i32[]\|null` | `never[] \| null` |
| `generics/is-list-over-union-arm-tests-emptiness.vl` | `i32[]\|null` | `never[] \| null` |
| `generics/null-only-type-param-binds-never.vl` | `{z:i32}\|null` | `{z: never} \| null` |
| `generics/nullable-alias-app-type-param-binds.vl` | `CN<i32>\|null` | `{v: never} \| null` |

All four have the same gap. A type parameter that only ever binds `null` binds to `never` (D3178),
and its `tvV` spelling is the default, `i32`. The alias application was never the gap: it is
the alias's record with a `never` field.

The function already built the pin's own type at those bindings. `monoClosedSlotTyAt` over
`monoPinOwnTvAtRep(tvN, tvV, tvT)` gives a `never` binding its default as its rep. That type
was only used for the pushed pin (`poSp`).

## Changed

- `po` is computed before `pinC`.
- `pinC` is `monoPinSpellShaped(po)`. A slot that stays open has no pin and refuses, as an empty
  substitution already did.
- Its `monoSubstAnn` read is deleted.

The rule's `never` decline (#7276) is unchanged: here, a `never` that has a default is spelled
at that default before the rule sees it.

## Probed

A scratch compiler (#7119's accumulator) kept `monoSubstAnn` as a fallback whenever the rule's
spelling was empty. It counted the fallback reaches, with an always-firing marker as the
control:

- the control fires in 413 programs;
- the fallback fires in 0.

## Left on `monoSubstAnn` in emit_mono

- `monoSubstAnonShapes`: re-spells an `#anon` binding by its fields.
- `monoSubstLetType`: D933's let union, registered and read back by spelling. It waits on w316.
- w321's `is` arm.

## Proof

- **Byte sweep.** The master fixpoint (`10033cbe`) against the candidate fixpoint: same 23,962, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Locally:**
  - refresh to a fixpoint, lint-self;
  - static budgets, with `--findings`: render-parse 20 / 58, dead exports 0;
  - late demands 6, seed size +0.8%;
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-spell shadow, pin-helper, render-parse budget and arena-tick tests: all
    pass.
