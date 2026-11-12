# Step 7 codecs: five `emit_shape_rows.vl` field-code readers ask the storage, 2026-11-12

This is group 1 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) for
`emit_shape_rows.vl`, agreed with w311, who owns the file's name-based ref-list cluster. None of
these five is in that cluster.

## What changed

- **`rowFieldTakesLit`** asks `fieldRowIsPlainI32` and `fieldRowIsStr`.
- **`variantFieldLayoutEq`**, the variant twins' layout guard:
  - compares the two rows with `fieldRowsStoreAlike`;
  - picks the referenced-layer check from `fieldRowSlotTable`: a ref list (nullable or not) or a
    record;
  - takes the map check through the new `fieldRowIsMap(r, false)`, which matches the old code 19
    and not 29.
- **`sigFieldMayMatch`** asks `fieldRowIsRecordRef` and `fieldRowIsUnionBox`.
- **`structRowFieldStoresAtom` and `variantRowFieldStoresAtom`** read `fieldRowStoresAtom`. That
  is the old `fieldCodeStoresAtom` over a row (plain `i32` is the atom, `string` is the string),
  and the code decoder is gone.
- `fieldRowIsMap(r, nul)` is new in `emit_atom_kinds.vl`. `emit_eq_rows.vl` imports this file, so
  `fieldRowKind` cannot be used here.

## What stays, by agreement with w311

These read codes until cut 5:

- the two scan-key sites, `shapeRowScanK` and `variantRowScanOfTyK`;
- the tag-phase compares (`variantLitPairKind`, `variantFieldLitRepMixed`,
  `variantFieldLitRepStrMixed`; see D15880);
- the writer `famRelayStructRow`.

## Measurement

`sweep.vl diff`, master `08531600`'s fixpoint seed (6,679,163 bytes) against this one (fixpoint,
6,679,051 bytes), over 24,037 programs:

- **24,037 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.
