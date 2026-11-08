# Step 7: classifier round 9, 2026-11-08

Round 9 switches two classifiers to recorded facts, using the shadow method from r6
(`2026-11-08-step7-classifier-batch2-r6.md`). Shadow counts are calls over the 23,634-program
sweep population, read from `classifier-census.vl -- --keep`.

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | probed |
| --- | --- | --- | --- | --- |
| master `e97619e8` | 21 | 0 | 70 | 91 |
| this PR | 21 | 0 | 70 | 91 |

The census counts functions, and both classifiers keep their names: they now read a fact.

**The field-storage fact.** Every field-table row now records its storage type in
`sFieldStoreTy` (`armStageStoreTy` while the arms are staged, `armFieldStoreTy()` either way).
It is the declared type, and at code 15 the declared type with `null`, because a record field
is stored nullable whatever it declares (`fieldStoreTyOf`, `emit_rec_field_codes.vl`). The
writers are the code writers: `pushFieldRow` (struct, variant-from-node and variant-from-text
recorders), the `#anon` mint in `collectS`, the three rows `emit_shape_intern.vl` mints, and
`rowMintFrom`. Adoption (`armAdoptRow`) and `armFieldRowMove` copy it as they copy
`sFieldLitTyIx`. `memberFieldCode`'s receiver ladder is now `memberFieldPos`, a field row, so
`memberFieldCode` and the new `memberFieldStoreTy` read one row.

**`readCellKind`'s Member arm reads `repOfTy(storage type)`.** The shadow (old code ladder vs
the storage type's rep), over the Member reads that reach it:

| old → typed | calls | meaning |
| --- | --- | --- |
| agree | 13,940 | |
| `nulstruct` → `nulvariant`, code 15 | 566 | a variant-declared field: the intended flip |
| falls back, `nulnone` storage | 94 | 21 at code 15, `hole \| null`: an inference hole names no record yet; 73 at code 37 |
| falls back, uncovered or no type | 785 | a type variable, or a row minted with no type; 29 of them nullable |

Ablated first (the arm answering `nulvariant` from the read's own rep): 99 bytes-only movers,
0 output movers. Each mover gains `ref.as_non_null` over the field read
(`readOwesNonNullRecover` now true), so the recovered read is the non-null variant its rep says.
No layout or recover-path change was needed. The arm falls back to the code ladder
(`fieldCodeCellKind`) only where the storage rep is uncovered, unknown or `nulnone`, which
covers the last two rows above (879 calls, 50 of them nullable), so the ladder stays for them.
The first candidate without the `nulnone` fallback broke `hole-derived-nesting.vl` (invalid wasm in `outerA`): the hole's storage rep `nulnone`
took the recover away.

**`arrLitIsF32` reads the literal's recorded type.** Shadow, typed = `tyIsF32ArrayTy(nodeTyAt)`:
86 `F → T` (all empty literals typed `f32[]`) and 10 `T → F` (`const xs: f32[] = [1]`, whose
integer elements the checker admits at f32 while the literal kept `i32[]`). The checker now
records an `f32[]` destination on such a literal (`recordElemRepArrayLit`, `check_literals.vl`),
and the classifier is the recorded type. Its spread rung and per-element
`exprIsF32` walk are gone. Empty `f32[]` literals stop reserving the i32 list pair they never build:
8 f32 programs shrink (`f32-array-push.vl` 1,584 → 1,482 bytes), outputs unchanged.

**Proof.** Both seeds are fixpoints. Base 6,512,640 bytes, candidate 6,514,923 (+2,283) on the tree merged with master `65816a85`. Sweep over
23,634 programs: 23,528 same, 106 bytes-only (98 the variant recover, 8 the f32 pair), 0 output
movers, 0 `runs → not-runs`, 0 new traps.
