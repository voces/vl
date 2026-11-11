# Step 7 slot layer, family B: `variantIndexOf`'s 53 sites graded by where the name comes from, 2026-11-11

`variantIndexOf(name)` answers the variant row registered under a name. On master `f570d7f7` it
has 53 call sites (a grep count over `compiler/*.vl`, comment lines left out). This note grades
every site by where its name comes from, as #7135 graded Family B's census. It then converts the
four sites the probe cleared. Base is master `f570d7f7`, whose fixpoint seed is 6,622,922 bytes.

## Method

The probe compiler was built from base plus the probe by the base seed, and never refreshed into
`build/`. Each tagged site computes the old answer and the candidate's. A `fambNote` tag records
the site once per program: `r` when reached, `d` when the two answers differ. At the end of
`emitProgram` an override turns any tag into the program's emit error, so an earlier failure
masks nothing. Programs that reach no tagged site kept their module bytes in the probe sweep.

The controls are the reach tags. Each converted site fired its `r` tag in the population, and
the two disagreeing sites fired their `d` tags on hand-written witnesses (MIX and ARM2 shapes
below). The sweep covered 23,911 programs. Counts are **programs**.

## The grading

| group | sites | grade |
| --- | --- | --- |
| a declaration's own name | `collectNestedFieldShapes`, `collectS` (`s.tdName`); `declArmsMatchRow` (`udVariants`); `leqNoteUnionArms`, `unionArmsNeedCloEq`, `unionBoxEqColumns`, `wideRetagPairs`, `armsHoldHeap`, `wideArmOfRow` (a union's member atoms); `memberArmRow` (a member atom); the three helpers `annDeclVariantRow`, `declVariantRowAt` over `cStructNames[p]` (4 sites) | BY DESIGN: the name is the declaration's identity |
| the registry's own name | `isTestedRowIn` (`uVariants[found]`); `rowDumpBuild` (a debug dump keyed by name) | BY DESIGN, see below |
| an annotation, an `is` test or a cast | `letAnnVariantIdx`; `alcNamesArm` | **converted**: `annDeclVariantRow` |
| the type's name | `unionArmTagsOfTy`'s un-annotated arm; `paramStructIndex`'s inline-shape guard | **converted**: `repVariantShapeRowOf` |
| the type's first name, unreached | `exprVariantIndex`'s pre-mono rung; `mfRecordElemRowName` | LEFT: no program reaches them |
| a name round-trip that disagrees with its row | `arrLitElemHintTy`, `arrLitElemNameTpl` (through `arrLitObjElemBoxVariant`); `cbRetVariantIdx`'s nominal gate | LEFT: the next cut |
| a ref-list bank's spelling (`rlElemName`) | `rlElemVariantHeap`, `rlElemLitStructRow`, `rlWidenVariantOf`, `rlElemStructRow`, `rlElemVariantRow`, `idxStoreClassify` | the ref-list bank's cut, w311 |
| a ref-array spelling ladder | `refArrShapeKindGo`, `nameIsRefArrayGo`, `nulStructElemNiche`, `refArrElemNameGo` | the ref-list bank's cut, w311 |
| the mv kind ladder and codecs | `mvValKindOfSpelling`, `mvValArmOfShapeTy`, `mvShapeOfValNameArmTyGo` (2) | the mv codecs, w309 |
| a union member's spelling | `memberUnionFieldName` | the union registry, w316 |
| a field's or type argument's spelling | `structElemArrayLowerable`, `internInlineShapeTyGo`, `gaeEnsure`, `armFieldDeferredRowOk`, `gaeArgIsTyParam` | the shape interner's name producers, this lane's later cuts |
| a name producer's own input | `nameIsStructDecl`, `armFieldStructRow`, `structRowOfNameTy`, `fieldTypeRefusalMsg` (2) | goes with that producer (`armFieldStructRow`, `structRowOfNameTy` are this lane's) |
| a monomorphization pin | `monoAnnPinName` (2) | BY DESIGN while a pin is a spelling; the instance lane |

The registry's own name: `isTestedRowIn` finds a row `found` and answers
`variantIndexOf(uVariants[found])`. That is the first row registered under the same name, and in
29 programs it is not `found`: an inline arm such as `{w: i32}` sits in two unions. The function's
contract is "the rows holding `ty`, deduplicated by name", so the round trip is the contract. It
goes when the union registry keys its rows by type (w316).

## The probe

| site | reached | differ | candidate |
| --- | --- | --- | --- |
| `letAnnVariantIdx` (`emit_ref_list_kinds`) | 2 | 0 | `annDeclVariantRow(d.letType, lt.tyName)` |
| `alcNamesArm` (`emit_collect`) | 2,313 | 0 | `annDeclVariantRow(ann, name)` |
| `unionArmTagsOfTy`, no recorded declaration (`wasmEmit`) | 44 | 0 | `repVariantShapeRowOf(aty)` |
| `paramStructIndex`'s inline-shape guard (`emit_sig_tokens`) | 5 | 0 | `repVariantShapeRowOf(nodeTyIxOf(p.parType))` |
| `exprVariantIndex`, pre-mono | 140 enter, 0 pass `nodeRepIs(variant)` | — | — |
| `mfRecordElemRowName` | 0 | — | — |
| `arrLitObjElemBoxVariant`'s round trip | 91 | **3** | the literal's own row `vr` |
| `isTestedRowIn`'s round trip | 183 | 29 | — (by design) |
| `cbRetVariantIdx`, the first rung | 5,939 | 0 where the name answers | `repVariantShapeRowOf(rt)` |
| `cbRetVariantIdx`, the nominal gate | — | **60** | the type is a declared arm member (`cVariantMemberTyIxSet`) |

## What changed

- `letAnnVariantIdx` and `alcNamesArm` read the annotation's recorded declaration
  (`annDeclVariantRow`). A node with none keeps its spelling's row, as before.
- `unionArmTagsOfTy` reads the declaration the cast names, else the arm's row by its type. It no
  longer reads `nominalStructNameOfTy` or `armRowNameOfRecord`.
- `paramStructIndex`'s inline-shape guard asks the parameter type's variant row, not its spelling's.
- **Deleted:** `armRowNameOfRecord`, its last caller gone, and with it the variant signature
  chains it walked (`ovnFirst`, `ovnNextOf`, `ovnBuild`, `objVariantIndexDrop` and their six
  columns), which nothing else read.

`variantIndexOf` falls from 53 sites to 50 (grep count). One of the 50 is new: `unionArmTagsOfTy`'s
recorded-declaration branch, a declaration's own name.

## The two disagreements

Both disagree in the answer and not in the module. A scratch compiler with both switches built
the 63 disagreeing programs (3 + 60) to byte-identical modules, so neither is a clause-1 candidate
today. Each is held for its own PR, so it can be refused alone.

- **`arrLitObjElemBoxVariant` (3 programs, ARM2).** `type A = {a: i32}` is an arm of `A | B` and of
  `A | i32`. A literal of `(A | i32)[]` builds at that union's row for `A`, but the name round trip
  answers `A | B`'s row, the first registered. Its two callers then read the wrong union.
  `tests/cases/types/union-list-alias.vl`, `unions/is-inline-arm-lone-literal-field.vl` and
  `unions/shared-nullable-scalar-field-read.vl`.
- **`cbRetVariantIdx`'s nominal gate (60 programs, MIX).** The callback
  `(y) => if y is Circle { y } else { d }` has an inferred-return spelling `{r: i32}`, which names
  no variant. Its type is `Circle`'s, which is a declared arm. The gate says "not nominal" and
  applies the struct check, but the type says the callback returns the arm.

## Proof

- Refresh ×2 is a fixpoint at 6,621,858 bytes (−1,064 on base).
- Local sweep (`scripts/sweep.vl` record/diff, fixpoint seeds both sides): 23,911 same, 0 movers.
- `regress.vl`: no runs lost. `lint-self`: clean. `cases_wasm`: 7,441 passed. Seed size, late
  demands, plumb-shape cost, ladder sets and the dead-export budget pass.
