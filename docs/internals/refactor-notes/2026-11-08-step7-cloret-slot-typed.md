# Step 7: `cloRetValSlot` reads its kind's row off the result type

Measured 2026-11-08, 4-core box, on master `7eeb80e6` (#6804). Both seeds are fixpoints (two
`refresh-compiler.sh` runs byte-identical). The sweep population is 23,662 programs.

`cloRetValSlot` had two ladders. One ran over the annotation's kind (`vtKindOfType`, then
`retStructRowIndex`, `annVariantRowOf`, `nulVariantIndexOf`, `tyAnnRefListSlot`, `mapAnnShape`).
The other ran over the stored kind (`fRetKind`, `cbRetVariantIdx`, `inferredRetMapSlot`). Now
there is one reader, keyed by `cloRetValKind`, over the result type (`cloRetResultTy`: the
annotation's type when declared, else `fnRecordedRetTy`):

| kind | declared | un-annotated |
| --- | --- | --- |
| map, nulmap | `mapShapeOfTyPeeled(t)` | the same |
| struct, nulstruct | `retStructRowIndex(ann)`, else the type's slot | `fRetStructIdx` |
| variant | `variantIndexOf(structNameOfTy(t))`, else the type's slot | `fRetStructIdx` |
| reflist | the type's slot | `fRetRListRow` (the values' row join) |
| any other | `repSlotOfKind(k, repSigSlotTyOf(t))` | the same |

## Shadow, by step (calls; `classifier-census --keep`)

| reader | agree | disagree |
| --- | --- | --- |
| `84e735f5`, a declared result at its annotation's type, one-record union peeled | 68,009 | 125 |
| a declared record at its nominal row, an un-annotated one at its values' stamp row | 68,064 | 71 |
| map kinds at `mapShapeOfTyPeeled` | 68,111 | 24 |
| un-annotated ref list at the row join, bundle arm only at kind `struct` | 68,124 | 11 |
| declared record at `retStructRowIndex`, un-annotated rows from the columns | sweep only | |

`84e735f5` alone, swept on this base, lost 2 runs (b000378 no longer did, after #6804).

Three things the type read alone gets wrong:

* `type AB = {a: i32} & {b: i32}` is a one-member `TyUnion`. `repStructRowOfTy` has no union arm,
  so `mkAB(): AB` read -1 (`ref valtype with no interned shape`). `repSigSlotTyOf` peels it.
* `a2<T>(): { f: ((t: T) => void) | null }` records a result type that is `tySame` to the
  instance's annotation type but is a different index. No row records that index, and the
  shape scan misses it. Reading the annotation's own type finds row 0.
* A record type can be shared by several declared rows (`Q1`/`Q4`, `Cfg` and the `{}` literal's
  row). The first row of the shape is not the one the annotation names. `retStructRowIndex` has
  the rungs for that, and the type has lost the name, for example a lambda's `(): Cfg`.

An un-annotated result whose row is the type's row and nothing else fails twice.
`() => ({})` delivered to `() => Cfg` lowers its columns as the annotation would
(`fnRetRowLowersAsAnn`). Reading the type alone (shape row 4 against row 1) produced invalid
wasm in `empty-object-all-nullable-runs.vl`. A ref list whose values disagree joins to -2.
So the un-annotated arms read the columns that `fnRetColsFromRecorded` wrote from the
recorded result.

**The bundle arm is redundant.** All 572 bundle calls agreed with `fRetStructIdx`, because
`fnRecordedRetCols` already takes the bundle row (`frsBundleRetRow`). Dropping `fnRetBundleTy`,
`elabKeyRetBundleTy` and `elabValueBuiltTy` moved no program.

## Proof

| check | master `7eeb80e6` | this branch |
| --- | --- | --- |
| fixpoint seed | 6,504,969 | 6,505,010 (+41) |
| sweep, 23,662 programs | | 23,662 same, 0 bytes-only, 0 output movers |

## What is left

* `cloRetKeySuffix` is now a pure function of (kind, `cloRetValSlot`). A token read off the
  type (`repSigRetTokOfTy`) disagrees on 30 calls, mostly maps and sets, where the token names
  the set flavour or no slot. It stays as a (kind, slot) → token map.
* `mfStructResultRowName` reads `cloRetValSlot` and returns the row's name. Replacing it means
  the `.map` call's result type names the row. That ablation was not run.
* `buildFnMap`'s un-annotated cascade, `synthRecordedRetAnnots` and `synthAnnOfTy` are
  untouched. Those ablations were not run.
