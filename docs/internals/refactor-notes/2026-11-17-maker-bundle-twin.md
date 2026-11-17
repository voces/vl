# A maker bound once and called at two signatures holds a bundle (lane SLOT, 2026-11-17)

Closes [D16845](../inventory/D16845.md), stacked on the twin build (#8918). This is design (B) as
ruled: one maker call and one environment, with a closure per signature. It reuses D14841's bundle
record and D15144's holder, adding no new mechanism of its own.

## What changed

- **Check, `fvaMakerCallRows`.** A plain maker that returns only lambdas it writes
  (`fvaSharedLambdaMaker`), whose call's binding is only called, at several closed signatures, is
  noted at all of them (`elabMakerCallAltsNote`, `check_elab_cap.vl`).
- **Elab.**
  - `elabCallRecord` and `elabPlainCallsNote` answer that signature list as the call's record, so
    the `const` is a D15144 holder.
  - `elabMakerBundleTwins` builds the maker's wide twin returning the bundle record.
  - `elabReturnedBundleSigs` answers that twin's signatures, the record keyed per instance as
    D15144 keys its own.
  - `elabDemand` selects the twin for that result.
  - `elabReachRows` keeps these records in the registry it resets.
- **Mono.**
  - `monoMakerTwin` builds a bundle-result twin and mints its row.
  - In that twin, `monoPinValueLambda` builds the returned hole lambda at each signature.
  - `monoBundleRetFe` reads those closures: they are built while the twin's body is cloned, so
    their rows are unkeyed.
- **Emit, `emitBundleRetLam`.** A lambda literal returned by a bundle-result function is built as
  the record, field by field, the return twin of `emitBundleArg`.

## Readings

Fixpoint seeds on both sides: the #8918 tree and this branch.

| check | reading |
|---|---|
| `maker-closure-called-at-two-parameter-types` (new) | 28 → 33 of 46 run; 0 runs → not-runs, 0 → silent, 0 traps |
| 69 maker / relay / bundle / returned-lambda templates | 0 runs → not-runs, 0 → silent, 0 traps |
| `tests/cases`, error text compared | 1 differs: the new fixture, now running |
| distilled corpus, per cell | `regress.vl --json` byte-identical |

## What the grading caught

The first candidate noted any function whose call's binding is called at two signatures. That
included `g` in `hole-lambda-bundle-returned-as-const-copy.vl`, which returns a held bundle, not
a lambda it writes. That candidate's emit then trapped or built invalid wasm in four bundle
fixtures. The note now requires `fvaSharedLambdaMaker`, and all four print their logs.

## Still refused

These stay loud emit refusals:
- a `let` reassigned between two makers;
- a `let` re-pointed between two calls of one maker;
- an `if` of two makers;
- the matrix's 13 other un-annotated positions (returns, assignments, record fields, list and map
  slots, captures).

Each needs the binding or slot to hold the bundle through a write or a capture.
