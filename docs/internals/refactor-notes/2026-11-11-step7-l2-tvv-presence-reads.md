# Step 7 L2 §7: thirteen `tvV` reads that asked only "is it bound", 2026-11-11

The typed-node note (`2026-11-10-step7-l2-mono-typed-node-text.md`) found that the binding
spelling `tvV` is not one render of `tvT`. Its uses have to move to the type one reader at a
time. This PR moves the readers that never needed the spelling's value: 13 reads that only ask
whether a type parameter is bound, or whether an annotation closes under the binding.

The base is master `8b88b166`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,873 programs.

## Probed

The probes ran in a scratch compiler that was never refreshed into a seed, using the accumulator
of #7119. A program that otherwise fails hides its probes.

- **`monoBindOf` presence.** `monoBindOf(tvN, tvV, tp) == ""` differs from `!strListHas(tvN, tp)`
  only where a bound entry's spelling is empty. 5,904 programs reach `monoBindOf`, and no
  bound entry is empty in any of them.
- **Annotation closure.** `monoSubstAnn(ann, typarams, tvN, tvV) == ""` was compared with a test
  on the parameter's type: does it name a type parameter (`tyMentionsTyVarNamed`) that `tvN`
  leaves unbound? The two agree in every program that reaches them: 102 at
  `monoPinTyParamComposite` and 2 at `monoHandWrittenLet`. The type is missing in none.

## Changed

- **11 presence tests** in `emit_mono.vl` read `strListHas(tvN, tp)`. They are in
  `monoDefaultUnboundTyParams`, `monoDefaultTyParamsOnlyGenFns`, `monoDefaultAnnTyParams`,
  `monoBindSeededTyParams`, `monoBindArenaFullTys`, `monoPreBindNonArrowArgs`,
  `monoPreBindNumJoin`, `monoPreBindPastEmptyLit`, `monoPinAnnotatedParam`,
  `monoPinTyParamComposite` and `monoPushPins`.
- **2 closure tests**, in `monoHandWrittenLet` and `monoPinTyParamComposite`, ask
  `monoParamTyOpenAt` (`emit_base.vl`, beside `monoTyMentionsTyParam`) of the parameter's
  type. `monoHandWrittenLet` no longer takes `ann`.

No function's `tvV` parameter becomes dead. Each one still reads the value somewhere else.

## The value reads that remain

- `monoBindOf`'s 3 value reads:
  - `monoBindSeededTyParams` keys `monoKeyExtra` by the spelling;
  - `monoLayoutConstOf` looks a `flat` layout up by the declared name (`flatConstOfNameProp`),
    which the checker owns;
  - `monoPinAnnotatedParam` compares the spelling with `an2`.
- `monoSubstAnn`'s 8 other callers, which use its text:
  - `monoSubstAnnNode` and `monoSubstLetType`, whose node text is read back (see the typed-node note);
  - `monoFoldLayoutAt`'s `is` arm (L6);
  - `monoPreBindPastUnionRest`;
  - `monoPinTyParamComposite` ×4;
  - `monoSubstAnonShapes`.
- `monoFoldTyParamLayout`'s 31 uses are pass-through to `monoLayoutConstOf` and the `is` arm.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint: 23,873 of 23,873 are the
  same, with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- render-parse (38 / 70) and the pin-helper budget (916) do not move. The new helper is in
  `emit_base.vl`.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
