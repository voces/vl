# Step 7 codecs, cut 3e: the field store values match on the storage kind, 2026-11-12

This continues cut 3b of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) in
`wasmEmit.vl`. Cut 3d (#7392) moved the construct side. This cut is its assign-side twin.

## What changed

- **`emitStructFieldStoreValue`** drops its code parameter.
  - It reads `fieldRowKind` and matches on it exhaustively.
  - The literal-union atom test (`sFieldIsLitUnion` / `sFieldIsLitUnionArray`) is asked by the same
    arms, in the same order, as the old ladder: every arm after `union`, `str` and `nulstr`.
  - `emitAssignMember` no longer reads the code.
- **`emitScalarFieldStoreVal`** takes a `VKind`. Its three callers:
  - `emitStructFieldStoreValue` passes its own kind.
  - `emitVariantFieldStoreVal` passes `eqRowFieldKind(-1 - vi, fi)`.
  - The shared-field plan store passes its first arm's kind. Its arms have identical field types
    (`sharedFieldTysIdentical`) by the time it stores.

## Measurement

`sweep.vl diff`, master `50210c06`'s fixpoint seed (6,653,584 bytes) against this one (fixpoint,
6,653,996 bytes), over 23,973 programs:

- **23,973 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left in `wasmEmit.vl`

- `emitOptChainIsNull` and `emitOptMemberValueGo`, through `optChainLeafNulDisc`,
  `emitOptChainLeafNulTest` and `optChainLeafRefHeap`, which take a code;
- the three `emitCoalesceOpt*` arms;
- `coalFieldStoredFlat`;
- the order stash, whose slots key on the code (`objOrderStashSlot`).
