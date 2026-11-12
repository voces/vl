# D15749 closes: a bundle holder's read bound at one member's annotated type runs, 2026-11-12

A holder keeps a hole lambda's bundle record whole and picks a member at each call through it
(D15144). An annotated `const` initialised with the holder's read was no copy of it
(`elabResMayHold` takes an un-annotated `const`), so it was a read the holder group could not
account for, and the whole group was refused.

- `elabResScanTypedRead` (emit_elab.vl) notes such a binding against the holder;
  `elabHolderRecordWith` counts it among the holder's reads where `elabTypedReadsHold` finds its
  type is one member of the record and it sits in the holder's function or a lambda nested in
  it, and records that member (`elabTypedReadMemberAt`).
- `emitTypedHolderInit` (wasmEmit.vl) picks the member off the holder's record, from
  `emitLetInitValue` in a function and from `emitStartGlobalInit` (emit_sections.vl) at the top
  level. Without the second, the top-level binding built invalid wasm (2 SILENT matrix cells in
  the first cut).
- D15749 comes off `live-sites.json` (the census reads FELL: its witness runs).
- Filed D15861 (an annotated parameter), D15862 (an annotated binding of a copy) and D15863 (a
  module holder read into an annotated binding inside a function), each a running neighbour away.

**Position matrix** `bundle-copy-handed`, master against this branch: 13 → 22 of 48 run, 0 SILENT,
0 runs → not-runs.
