# Step 7 L2 §7: the function-value coercion carries no spelling (render-parse 61 → 60), 2026-11-11

After `2026-11-11-step7-l2-mono-fn-value-pins-by-type.md` (#7182), the spelling `tname` that
`monoCoerceFnValueTys` and its helpers carried still had four readers:

- **`monoCellSigOne`**: a capture cell's one signature, keyed per value by `monoFnNameSig(tname)`,
  the normalised parameter text;
- **`monoCellConcreteTake`**: the parameter compare `monoFnNameSig(has) != monoFnNameSig(tname)`,
  and the nullable test `nonNulBaseOf(tname) == tname`;
- **the instance compare in `monoCellValueTakeAt`**: `monoSlotSig(ife) == monoFnNameSig(tname) + ";"`;
- **`monoCoerceWrittenLetTys`' gate**: `annArrowAt(tname0)`, and `monoCoerceChoiceBinding`'s key
  fallback `ct`.

This PR moves each one to the type. After that the spelling is only passed along, so it is
deleted from the whole chain.

The base is #7182 merged into master `161d481c`, with a fixpoint seed on both sides. The
population is the whole sweep: 23,902 programs.

## Probed

The probes ran in a scratch compiler that was never refreshed into a seed, using #7119's
accumulator. A program that fails for another reason first hides its probes.

| site | reached in | type missing | type answer differs |
| --- | --- | --- | --- |
| `monoCellSigOne`, `tyToStr` parameter key vs `monoFnNameSig` | 19 | 0 | 0 |
| `monoCellConcreteTake` (nullable test, and the parameter compare by `tySame`) | 12 (1 compare) | 0 | 0 |
| instance compare, `monoInstParamPinTys(ife)` vs `tnameTy`'s parameters | 1 | 0 | 0 |
| `monoCoerceChoiceBinding` / `monoCallIfBound` key: the spelling fallback taken | 5 / 6 | — | never taken |

The written-let gate was measured in #7182's note. Its type form disagrees with the spelling in
28 programs:

- in 24, the spelling is an open `(T) => T` with no type;
- in 4, the type is a function but the spelling is a nullable union or a sig pin.

A candidate asking the type was swept with no other change. All 23,902 programs are the same, so
the 28 take another path through the coercion ladder to the same bytes.

## Changed

- `monoCellCoercedSig` holds the function type each value was taken at. `monoCellSigOne`,
  `monoCellConcreteTake` and the instance compare ask `monoFnTyParamsSame`, which is new and
  compares parameters by `tySame`. `monoFnNameSig`, a parse, is deleted.
- `monoCoerceWrittenLetTys`' gate asks whether `tnameTy0` is a function type. That cuts one
  `annArrowAt` parse.
- `monoCoerceChoiceBinding` keys a choice binding by `tyToStr` of its type in every case.
- `tname` is deleted from `monoCoerceFnValueTys`, `monoCoerceFnValueName`, `monoCoerceWrittenCell`,
  `monoCoerceAliasOfCell`, `monoCoerceAliasOfWrittenLet`, `monoCoerceChoiceBinding`,
  `monoCoerceWrittenLetTys`, `monoCoerceNamedGenericTys` and `monoCellValueTakeAt`, across 71 call
  sites. Three spellings built only for it go too: `monoCallWrittenLet`'s `ct`, `monoPinNestedListElems`'
  `ann`, and `monoCoerceAtValueParams`' `pn`. So do two `monoPinAnnSpelling` calls handed
  straight in.

## Not cut

- **`monoCallIfBound`'s `ct`** (`monoSlotPinNameTys`). It still gates "the slot has a pin" and
  is the key's fallback, which is never taken.
- **The callee-annotation parse** in the same function as `pn`
  (`monoFnTypeAnnParamsName(ann, parts)`). It still gates on arity.

## Proof

- **Byte sweep.** The #7182 fixpoint against the candidate fixpoint: 23,902 of 23,902 are the
  same, with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- **Budgets:**
  - render-parse goes from 38 / 61 to 38 / 60, with the baseline lowered here;
  - the pin helpers stay at 912;
  - the seed shrinks by 4,871 bytes (+0.4% against its baseline);
  - late demands 6, dead exports 0.
- **Locally:** refresh to a fixpoint, lint-self, `mono-tyaram-grid.sh` (252 OK, 9 REJECT, no BAD),
  and distilled `regress.vl` (no runs lost; its 2 other movements are the same on master).
