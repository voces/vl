# Step 7 codecs: the struct twin guard compares field storage, not field codes, 2026-11-12

This is group 3 of `2026-11-11-step7-codec-field-rep-column-design.md` (#7250) for `emit_rep.vl`.
#7469 left `structFieldCodesEq` on codes because `emit_atom_kinds.vl` imports `emit_rep.vl`, so the
stored-alike predicates could not be imported there.

## What changed

- **Three helpers move down into `emit_rep.vl`.** They need only `repOfTy`, which lives there,
  and the field columns:
  - `rowStoreRepIn` (a row's covered storage rep);
  - `fieldStorageKindOf` (the storage kind, a variant ref named as its arm's struct row);
  - `rowsStoreAlikeIn` (the cut 3c rule over any two tables).

  `emit_atom_kinds.vl` imports them, and its predicates are unchanged.
- **`structFieldCodesEq`**, the layout guard behind struct twinning and the slot-heap dedup:
  - compares each field pair with `rowsStoreAlikeIn`;
  - picks the referenced-layer check with `fieldRowRefsElemHeap`: a record ref or a ref list,
    nullable or not, and by the code (`fieldCodeRefsElemHeap`) where only the code answers.

## Measurement

This is identity by construction, because a code is a function of the rep. It was measured by CI's sweep
under the `sweep` label, per the 2026-11-12 process. D15880's precondition (#7500) holds, so asking
the storage rep here is safe at any phase.
