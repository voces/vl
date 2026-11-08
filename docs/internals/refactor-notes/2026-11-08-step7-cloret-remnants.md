# Step 7: the cloRet* remnants (2026-11-08)

Measured on a 4-core box, on master `2fce5a50` (#6836). Both seeds are fixpoints (two
`refresh-compiler.sh` runs give byte-identical output). The counts are calls, from
`clsCensusEnter("SH …")` and `classifier-census --keep`, over the sweep population.

## `mfStructResultRowName`

Over the whole population, one program (D4712) entered it, once, and the typed read agreed.
That read is the `.map` call's element type (`tyArrayElemIx(nodeTyInOf(call))`), taken at
`structRowOfRecordTy`, and then at `variantIndexOf(structNameOfTy)`. Its two callers in
`refListElemNameOfCall` and `refListKeptSlotOfCall` now ask `mfRecordElemRowName`, which reads
only the type. The classifier, and its `cloRetValSlot` and `cloRetValKind` reads, are gone.

## `cloRetKeySuffix` against `repSigRetTokOfTy(cloRetResultTy(fe))`

| reader | agree | disagree |
| --- | --- | --- |
| master | 57,781 | 89 |
| a set's shape spelled as its map in `repSigTokOfTy` (`mapShapeFoldSet`) | 57,799 | 71 |

The 18 calls that closed were `Set<i32>` (`m-4` against `m-5`), `Set<string>` (`m-1` against
`m-2`) and `Set<i32> | null`. The lowering already keys a set at its map sibling, and
`fn_ret_shadow`'s `frsFoldSetTok` folded the type side by hand.

All 71 calls that are left are slot-carrying kinds whose result type holds an un-annotated
function (`(_) => _`):

| class | calls | classifier | type |
| --- | --- | --- | --- |
| bundle record (maker returns a record of signatures) | 60 | `>sN;` | `>c` |
| map of function values (`{[string]: (_) => _}`) | 7 | `>m-1;` | none |
| un-annotated ref list whose values' rows disagree | 3 | none | `>r0;` |
| record holding such a list | 1 | `>s3;` | `>s2;` |

**Ablation.** A seed whose `cloRetKeySuffix` was the type token and nothing else. All 26
programs behind the 71 calls kept their exit code and output (22 run, 4 are filed refusals),
and all 26 changed bytes. So no program tells the two keys apart. The type is still wrong for
the bundle class: the type of a function that returns a bundle is the template's function type,
and its `>c` names a closure result that the lowering does not build. Adopting it would rest on
no two such functions ever sharing a parameter spine with a real closure. It was not adopted.

## Now

`cloRetKeySuffix` keys a slot-free result with its type's token. A struct, variant, ref-list or
map result is keyed by the row its values are built at (`cloRetValSlot`), because in the four
classes above the type does not name that row. The per-kind token ladder is gone. What is left
assembles one slotted token.

## Proof

| check | master `2fce5a50` | this branch |
| --- | --- | --- |
| fixpoint seed | 6,535,932 | 6,535,406 (−526) |
| sweep | | SWEEP |

## What is left

* Bundle results: `fnRecordedRetTy` records the template's function type, not the bundle
  record (`elabBundleRecordOf`). Once it records the record, rerun the shadow. The slotted branch
  can then read the type for kind `struct`.
* A map of un-annotated function values: `repMapSlotOfTy` answers -3 where `mapArmShapeOfTy`
  answers the key's mono shape (`mvSlotOfValTyK` returns -1). The two readers must agree before
  map results can read the type.
* An un-annotated ref list whose values disagree: the type names `r0`, and its values join to
  -2 (no sig). This is the D15221 named set.
