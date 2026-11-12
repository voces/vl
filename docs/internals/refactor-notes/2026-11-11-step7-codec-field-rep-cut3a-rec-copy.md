# Step 7 codecs, cut 3a: the record-copy and record-fit matchers carry field rows, not codes, 2026-11-11

This is cut 3a of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250). These are the
`wasmEmit.vl` matchers that built arrays of field codes from rows only to dispatch on them. The
shape-intern arrays (cut 3b) feed the code column directly, so they go with the column change.

## What changed

- **Flat-row predicates** (`emit_classify.vl`): `fieldRowIsUnionBox`, `fieldRowIsPlainI32`,
  `fieldRowIsRecordRef`, `fieldRowIsNulNone`, `fieldRowIsStr(r, nul)` and `fieldRowNumKind`. Each
  reads `repOfTy(sFieldStoreTy[r])` through `fieldRowStoreRep`. The field code answers only where
  the type is unrecorded or uncovered, or reps as `nulnone`. The cut-1 `(si, fi)` predicates now
  delegate to them.
- **The arrays hold flat field rows.** `variantRowFields`, `emitStructExprAsVariantBox`,
  `emitRecCopyInto`, `emitRecCopy`, `emitRecCopyFields`, `emitRecCopyLevel` and `rcHasNested` take
  `dFieldRows`. `rcNestedRow`, `rcWrapKind`, `emitRecordFitIs`, `emitDiscrimFieldEq` and
  `emitFieldLitEq` ask the predicates. `fieldCodeNumKind` is no longer read in `wasmEmit.vl`.

A plain `VKind` would not do here, because `fieldCodeNumKind` and `emitFieldLitEq` take code 0
and not code 30. Both reps have kind `i32`, and only the null discipline (`rdNul`) tells them
apart. That is why the predicates answer from the whole rep.

## Measurement

`sweep.vl diff`, master `f46fc242`'s fixpoint seed against this one (23,923 programs):

- **23,923 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

The seed is 6,623,796 bytes (+836 against 6,622,960), and it is a fixpoint after two refreshes.

`fieldRowNumKind` is an exhaustive `match` over `VKind` (`kind-ladder-incomplete`), not an `if`
ladder with a default.
