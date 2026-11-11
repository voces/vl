# Step 7 L2 §7: a widened instance result is carried by type (renders 37 → 36), and emit_mono's renders and parses classified, 2026-11-11

## Cut

The global `monoInstRetWidenName` carried a widened result's spelling into `monoMakeInstanceGo`.
`monoInstanceRetName` carried the slot's result into `monoInstanceFor`. Each spelling had two
readers:

- a presence test, `!= ""`;
- the fallback of the instance key when `monoInstRetWidenKey` (`tyToStr`) was empty.

Both spellings were set beside a type: `monoInstRetWidenTy` and `monoInstanceRetTy`. A probe
(#7119's accumulator, scratch compiler) compared presence of the spelling with presence of the
type:

| site | reached in | on | differs | key empty while on |
| --- | --- | --- | --- | --- |
| `monoMakeInstanceGo`, `retWiden != ""` vs `retWidenTy >= 0` | 9,365 | 31 | 0 | 0 |
| `monoInstanceFor`, `monoInstanceRetName != ""` vs `monoInstanceRetTy >= 0` | 49 | — | 0 | — |

So both spellings are deleted. Presence reads the type. The key is `monoInstRetWidenKey`, which
is never empty when a result is widened. `monoInstanceRetTy` is set only while a widened return
is delivered, as `monoInstanceRetName` was. Two renders go with them: `monoMakerTwin`'s
`tyToEmitName` and the Ident arm's `monoPinAnnSpelling`.

The base is #7198 merged into master, with a fixpoint seed on both sides. The population is the
whole sweep: 23,910 programs.

## The renders and parses left in emit_mono

The census (`render-parse-census.vl --list`) leaves 17 `tyToEmitName` renders and 6 type-string
parses in `emit_mono.vl`. The classes are those of `2026-11-10-step7-l2-render-classes.md`.

| site | class | why it stays |
| --- | --- | --- |
| `monoListUnionRowName`, `monoSubstAnonShapes`, `monoAnnPinNameOfTy`, `monoI32AtomPinName`, `monoHoleMapPinName`, `monoLitUnionPinOfTy`, `monoFnTyPin`, `monoPinAnnSpelling`, `monoConcreteFnPinName`, `monoPinLamAtTys`, `monoLamPinName`, `monoNarrowedPinName`, `monoNicheWidenedPinName` (13 renders) | key: a pin spelling | an instance is keyed by its pins' spelling, and the pin is also the instance parameter's annotation text |
| `monoPreBindNumJoin` (1 render) | key: a binding spelling (`tvV`) | `tvV` is still read as a value by `monoSubstAnn` and the clone path |
| `monoInstanceRetSpelling` (1 render) | key: a returned pin spelling | its callers key by it |
| `monoPinUnionBoxed`, `monoPinUnionNameOfTy` (2 renders) | key: the union registry by name | L6 (w316) |
| `monoAnnPinName` `nameIsArray`, `monoNulAnnName` `nullablePartOf`, `monoCompositeListAnnName` `nameIsArray`, `monoArgTyNameProjected` `nameIsArray` (4 parses) | key: the annotation-spelling pin ladder | the ladder decides which spelling is a pin; its input is a spelling at every caller |
| `monoNameNarrowsFrom`, `monoNulRecNamesNarrow` `nullablePartOf` (2 parses) | decision: compares spelled pins | both sides are pin spellings (`wide`), so there is no type to compare against yet |

`nodeMapArmNominalName` (`emit_sig_tokens`, w312's classification) belongs to the same seam: it
renders a map key's mono pin.

Every row is the one seam: **instances keyed by type**. None of these is an output floor. Each is
deleted, not converted, once the instance key and the instance parameter's annotation come from
the pin's type. The cuts in this lane so far took the reads that wanted only presence, emptiness
or equality. What is left wants the spelling's value.

## Proof

- **Byte sweep.** The #7198 seed against the candidate fixpoint: 23,910 of 23,910 are the same,
  with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- **Budgets:**
  - render-parse goes from 37 / 60 to 36 / 60, with the baseline lowered here;
  - the pin helpers stay at 912;
  - late demands 6, seed size +0.5%.
- **Locally:** refresh to a fixpoint, lint-self, `mono-tyaram-grid.sh` (no BAD), and distilled
  `regress.vl` (no runs lost).
