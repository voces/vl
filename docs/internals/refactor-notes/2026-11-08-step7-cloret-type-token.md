# Step 7: `cloRetKeySuffix` reads the type (2026-11-08)

Measured on a 4-core box, on master `07eeefc8`. Both seeds are fixpoints (a second
`refresh-compiler.sh` gives byte-identical output). The counts are calls, from a shadow
`clsCensusEnter("SHX …")` in `cloRetKeySuffix` and `classifier-census --keep`, over the sweep
population. The shadow compared the per-kind path against the type-derived token.

## Shadow

| reader | agree | disagree |
| --- | --- | --- |
| master (`repSigRetTokOfTy(cloRetResultTy(fe))`) | 57,796 | 71 |
| + bundle arm, map mono shape, values stamp, list join | 57,862 | 5 |
| + the lambda record row | 0 disagreements on the one program behind the 5 | |

The last row was checked only on its own program. The sweep below covers the whole population: a
key that differed would change that module's bytes.

## What closed each class

* **Bundle results (60).** The result type is the template's function type, so `elabIsBundleTy`
  does not hold of it: the bundle record never appears as a type. The typed source is the one
  `fnRecordedRetCols` already used, `frsBundleRetRow` (the elaboration's returned record
  signatures, else the handed-back bundle parameter's). It moved down to `emit_classify.vl` as
  `fnBundleRetRow`. A `closure`-rep result with a bundle row keys `>sN;`, and -2 keys "".
  `fnRecordedRetTy` still records the type.
* **Map of function values (7).** `repMapSlotOfTy` answered -3 where `mapArmShapeOfTy` answers
  the key's mono shape. A function value is held as its table id, so a `TyFunc` value now takes
  `mapMonoShapeOfKey`. This is narrower than `mapArmShapeOfTy`, which takes the mono shape for any
  value with no mv slot.
* **Record holding a list of records of functions (1, `d15221_nest_dbl`).** The type names `s2`,
  and the values are built at `s3`, one row per function set. `frsValuesStampSlot`, the rep
  stamps of the returned values, moved down as `fnValuesStampSlot`. An un-annotated record or
  variant keys the row it names.
* **Lists whose values join at no row (3, D15221/D15294 named cells).** The type names `r0`, and
  `fnRetRefListRowJoin` gives -2 because the elements hold different function sets. All three are
  filed emit refusals (`the lists this function returns are built at different rows`), and that
  refusal does not read the key. A `reflist` whose join is -2 keys "", as before. The join was not
  changed. Making these build would need the result type to carry function sets.
* **Lambda record row (5 calls, one program, `empty-object-all-nullable-runs`).** The values stamp
  introduced this one: the columns let `criLambdaRecordRow` win over the stamp. It moved down as
  `fnLambdaRecordRow`, and the token takes it first.

## Now

`cloRetKeySuffix` is the type-derived token: those four arms, then `repSigRetTokOfTy`. The
per-kind path (`cloRetValKind` → `cloRetValSlot` → `repSigVariantTok` and similar) is deleted
from it. `cloRetValKind` and `cloRetValSlot` are still read by other callers, in
`emit_closure_sites.vl`, `emit_collect.vl` and `emit_sections.vl`.

## Proof

| check | master `07eeefc8` | this branch |
| --- | --- | --- |
| fixpoint seed | 6,543,478 | 6,543,697 (+219) |
| sweep, 23,690 programs | | 23,690 same, 0 bytes-only, 0 output movers |

The seed grows because the three moved readers are now also called from the key path.
