# Rep ADT stage 3d-ii: a field's map key kind is its storage type's, 2026-11-16 (lane REP)

Step 3d-ii, after [3d-i's read-time shadow](2026-11-16-rep-adt-stage3d-i-sidecar-shadow.md). A
field's map key kind is now read off its storage type: the map key's kind, through one `| null`,
and the string key for a non-map (`fieldKeyKindIn`).

## What is deleted

- The `sFieldElemKeyKind` and `armStageElemKeyKind` columns and the `armFieldElemKeyKind` accessor.
- The key half of `recordFieldElemRow`, and the `keyK` parameter of `pushFieldRow` and both
  recorders.
- The key kinds each minter computed only to store: `nodeTyMapKeyKindSpan` and `tyMapKeyKindSpan`
  at three `pushFieldRow` callers, and the alias shape's recorder, `iisPushFieldElem`'s `fkK`.
- The anon mint's `elemKeys` and `anonFieldElemKeyKind`.
- `rowMintFrom`'s copy and its padding.

Net **−106** compiler lines.

## Graded before the flip

3d-i's read-time shadow counted every key-kind read, through `sFieldRowKeyKind`, `uFieldRowKeyKind`
and `rowMintFrom`'s copy, over `tests/cases`, `std`, the distilled `cells/` and `named/` and the
self-build. **No key-kind read disagreed.** The end-of-emit sweep found 3 rows of 27,154 that
disagree: a `reflist` row storing an i32 key. No reader reads those rows.

## Identity

Both seeds are fixpoints; the base is master `36115ad75` plus 3d-i (#8607).

| | |
|---|---|
| `corpuscmp.vl` (`tests/cases`, `std`) | 8,325 modules: 6,956 identical, **0 DIFFER, 0 LOST** |
| distilled cells and named, built with both seeds | 8,914 buildable: **8,914 identical** |
| L2 self-compile fuel | 92,893,742,789 (3d-i) → 92,887,329,564 (−0.007%) |
