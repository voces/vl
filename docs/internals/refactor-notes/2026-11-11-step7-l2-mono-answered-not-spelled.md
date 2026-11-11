# Step 7 L2 §7: three mono sites that spelled a type only to ask whether one was there, 2026-11-11

Some emit_mono sites build a spelling, from `tvV` (`monoSubstAnn`) or a render
(`monoPinAnnSpelling`), and then only test it for emptiness or compare it with an earlier one.
This PR has each of them ask the type. It removes 3 `tvV` reads and 4 `monoPinAnnSpelling` calls.

The base is #7189 (stacked on #7182) merged into master, with a fixpoint seed on both sides. The
population is the whole sweep: 23,907 programs.

## Probed

The probes ran in a scratch compiler that was never refreshed into a seed, using #7119's
accumulator. A program that fails for another reason first hides its probes.

| site | question | reached in | differs |
| --- | --- | --- | --- |
| `monoPinTyParamComposite`, open generic value | `monoSubstAnn(ann, …, tvV) != ""` vs `!monoParamTyOpenAt` | 102 | 0 |
| `monoPinTyParamComposite`, written `let` handed | the same | 2 | 0 |
| `monoPinTyParamComposite`, literal holding a generic | the same | 0 | — |
| `monoPinTyParamComposite`, closed key or list-read type | `monoPinAnnSpelling(t) == ""` | 0 / 1 | never empty |
| `monoCoerceListCbArg` | `monoPinAnnSpelling(ft) == ""` | 40 | never empty |
| `monoHandWrittenLet`, second hand-on of one binding | spelling `!=` vs `!tySame` | 2 (1 repeated) | 0 |

## Changed

- **`monoPinTyParamComposite`'s `anC`** is now a boolean, "a rung answers the argument's type".
  Its value was read only by emptiness tests and by the `#anon` row capture, which keeps
  `monoArgPinName`'s answer. Changes inside it:
  - the three substitutions are now a closure test;
  - the two closed-type renders are now `true`;
  - `monoArgFnTypeName` is asked whether it answers;
  - the `#anon` respelling (`monoAnnPinNameOfTy`) now only gates `anRowPin`.
- **`monoCoerceListCbArg`** drops a render that only guarded a type that is always present.
- **`monoHandWrittenLet`**:
  - `monoWrittenLetHanded` keys each binding by the function type it is handed on at, compared by
    `tySame`;
  - the guard asks `monoTyClosedFn(ept)` directly.

The one site never reached keeps the same contract: "the annotation closes under the binding".

## Left

`monoPinTyParamComposite`'s pin, `pinC = monoSubstAnn(ann, …, tvN, tvV)`, and
`monoSubstAnonShapes` are still read as the pin's spelling. They go when a pin is no longer
spelled.

## Proof

- **Byte sweep.** The #7189 fixpoint against the candidate fixpoint: 23,907 of 23,907 are the
  same, with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- **Budgets:** render-parse (37 / 60) and the pin helpers (912) do not move. Late demands are 6
  and seed size is +0.5%.
- **Locally:** refresh to a fixpoint, lint-self, `mono-tyaram-grid.sh` (no BAD), and distilled
  `regress.vl` (no runs lost).
