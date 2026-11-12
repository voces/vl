# Step 7 codecs, cut 1d: the row predicates move under `emit_obj_lit_fits.vl`, and its comparisons ask them, 2026-11-12

This continues cut 1 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250), in the
first file below `emit_classify.vl` in the import order.

## What changed

- **The flat-row predicates move to `emit_atom_kinds.vl`,** beside `sFieldTypeAt` and
  `variantFieldTypeAt`. They are `fieldRowIsUnionBox`, `fieldRowIsPlainI32`, `fieldRowIsRecordRef`,
  `fieldRowIsNulNone`, `fieldRowIsStr` and `fieldRowNumKind`. `emit_obj_lit_fits.vl` sits below
  `emit_classify.vl`, so it could not import them from there. `emit_classify.vl` keeps its
  `(si, fi)` wrappers and imports the predicates.
- **Variant forms read the arm table.** `variantFieldIsUnionBox`, `variantFieldIsNulStr`,
  `variantFieldIsNulNone` and `variantFieldIsRecordRef` read `armFieldStoreTy()`, which is the
  staging column until the arms adopt their rows, as `variantFieldTypeAt` reads `armFieldTypes()`.
- **Seven comparisons in `emit_obj_lit_fits.vl` ask them:** `objLitFitsRow`,
  `sharedFieldArmStructTag`, `sharedPlanBoxesSome`, `sharedFieldArmValueBox`,
  `sharedFieldArmNulStr`, `sharedFieldArmNull` and `sharedFieldArmAtomKind`.

The two row-to-row code comparisons, `structIdxMatchesVariantIdx` and
`structIdxConvertsToVariantIdx`, compare a field code across two rows. That is the dedup-key
question of cut 3b, so they stay as they are.

## Measurement

`sweep.vl diff`, master's fixpoint (6,633,237 bytes) against this one (6,633,815 bytes), over
23,933 programs:

- **23,933 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.
