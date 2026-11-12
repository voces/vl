# Step 7 codecs, cut 1c: the variant-table field-code comparisons and the `string | null` recover ask the row, 2026-11-12

This continues cut 1 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) in
`wasmEmit.vl`. It stacks on #7316 and uses that PR's flat-row predicates.

## What changed

- `emitNulStrFieldRecover` takes a flat field row, not a code, and asks `fieldRowIsStr(r, true)`.
  Its four callers pass the row: `emitNarrowedMem`, `emitMemVariantRead` (twice) and
  `emitMemStructRead`.
- Ten comparisons of `variantFieldTypeAt(vi, fi)` against `FC_UNION` or `FC_NUL_STR` ask
  `fieldRowIsUnionBox` or `fieldRowIsStr` of `uFieldStart[vi] + fi`. They are in
  `emitArmFieldsFit` (3), `emitNarrowedMem`, `sharedFieldReadBoxes`, `emitSharedFieldArm`,
  `emitMemVariantRead` (2) and `emitCoalesceUnionField`.

The `code` that `sharedFieldReadBoxes` and `emitSharedFieldArm` compare is a shared-read
plan's code, not a row's, and it stays as it is.

## Measurement

`sweep.vl diff`, this branch without the change (fixpoint, 6,626,655 bytes) against it with the
change (fixpoint, 6,627,215 bytes), over 23,933 programs:

- **23,933 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left in `wasmEmit.vl`

These `sFieldTypeAt` / `variantFieldTypeAt` reads pass the code on to a code-taking function, or
dispatch on many codes at once:

- `sFieldStorageSlot`;
- `emitStructFieldValueUnder`, `emitObj`, `emitVariantFieldValueUnder` and `emitVariantStruct`;
- `emitVariantFieldStoreVal` and `emitAssignMember`;
- `emitOptChainIsNull`, `emitOptMemberValueGo` and the three `emitCoalesceOpt*` arms;
- `coalFieldStoredFlat`.

The value deliveries go with the column change (cut 3b), because their callees take the code
as the storage vocabulary.
