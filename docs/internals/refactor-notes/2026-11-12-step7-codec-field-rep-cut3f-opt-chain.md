# Step 7 codecs, cut 3f: the `?.` leaf and `?.` … `??` readers ask the field's storage, 2026-11-12

This continues cut 3b of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) in
`wasmEmit.vl`: the optional-chain readers that took a field code.

## What changed

- **`optChainLeafNulDisc(si, fi)`** answers in `rdNul`'s vocabulary from an exhaustive `match` on
  `fieldRowKind`. Only the `i32` arm needs the null discipline: the `K | null` niche is 3, a plain
  `i32` is 0.
  - **`emitOptChainLeafNulTest(si, fi)`** follows it.
  - `emitOptChainIsNull` no longer reads the code.
- **`optChainLeafRefHeap(si, fi)`** matches the list kinds, nullable and not, onto their wrapper
  heaps.
- **`optChainLeafBoxKind` is deleted.** It answered exactly what `fieldRowNumKind` answers.
- **`emitOptMemberValueGo`** reads the leaf's kind. Its no-rep guard asks
  `optChainLeafBoxable(k)`, which covers the five kinds its arms build.
- **The `?.` … `??` arms** read the field row, through `optLeafKindOf`, `fbIfForOptLeaf` and
  `emitOptLeafDefault`:
  - `emitCoalesceOptNulStruct`;
  - `emitCoalesceOptNulVariant`;
  - the map arm's `i32` gate.

  The kind comes from the numeric kind and the non-null string predicate. `optChainFieldCodeOk` and
  `emitOptChainDefault` are deleted. `fbIfForSharedField` and `sharedFieldCodeDispatchable` stay
  for the shared-field plan, whose code is the plan's, not a row's.
- `coalFieldStoredFlat` asks `fieldRowNumKind` and `fieldRowIsStr`.
- **`sFieldFlatRow(si, fi)`** (`emit_atom_kinds.vl`) is the bounded flat-row reader. It answers -1
  off the table, and the row predicates read -1 as no row. These two readers use it
  (`sentinel-index-unguarded`).
- **`variantFieldNumKind` and `variantFieldIsStr`** (`emit_atom_kinds.vl`) are the arm-table
  twins of `fieldRowNumKind` and `fieldRowIsStr`. All four read one rep-level helper each
  (`numKindOfRep`, `strOfRep`).

## Measurement

`sweep.vl diff`, master `50210c06`'s fixpoint seed (6,653,584 bytes) against this one (fixpoint,
6,654,497 bytes), over 23,973 programs:

- **23,973 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left in `wasmEmit.vl`

- `sFieldStorageSlot` moves off the code in #7380.
- The order stash still keys on the code: `objOrderStashSlot` and `liBack = 100 + code`.
- The shared-field plan still dispatches on a plan code.
