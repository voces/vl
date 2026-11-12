# Step 7 codecs, cut 3c: a field's storage slot and the prefix rule ask the storage kind, 2026-11-12

This continues cut 3b (`2026-11-12-step7-codec-field-rep-cut3b-storage-valtype.md`, #7366). The
type section already wrote a field's valtype from its storage kind. Before this change, the slot
that valtype resolves through, and the supertype rule's storage comparison, were still chosen by
the field code.

## What changed

- **`fieldRowSlotTable(r)` and `variantFieldSlotTable(vi, fi)`** (`emit_atom_kinds.vl`) name the
  table a field's slot indexes: `"struct"`, `"map"`, `"reflist"` or `"none"`, as the
  `FieldSlotTable` union.
  - They read the storage kind through an exhaustive `match`.
  - The field code answers where the kind is null.
- `sFieldStorageSlot` (`wasmEmit.vl`) and `uFieldStorageSlot` (`emit_lit_atoms.vl`) match on that
  table. They no longer compare codes.
- **`fieldRowsStoreAlike(a, b)`** replaces `sFieldStoreCode` in `structRowIsProperPrefix`
  (`emit_sections.vl`).
  - Two rows are stored alike when their kinds and their null disciplines agree.
  - Where either row has only its code, they are stored alike when their codes agree.
  - Kind alone would make codes 0 and 30 alike. Their wasm storage is the same `i32`, but that would
    relate rows the code kept apart, and the module bytes would move.

This tree also corrects the cut 3b note. #7357 closed D3938, which now runs, and the note gives
the merged-tree measurement.

## Measurement

`sweep.vl diff`, master `5e0a0ccf`'s fixpoint seed (6,646,945 bytes) against this one (fixpoint,
6,647,503 bytes), over 23,962 programs:

- **23,962 same**;
- 0 bytes-only movers;
- 0 output movers;
- 0 `runs → not-runs`;
- 0 new compiler traps.

## What is left

- The value deliveries in `wasmEmit.vl` hand the code to code-taking callees.
- `pushFieldStorage` remains for the order stash, the shared-read plan and the fallback.
