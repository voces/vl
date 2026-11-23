# IR coverage: `??` over a field of a re-read top-level receiver (2026-11-23, lane IR-N2)

The class is `start: coalesce field place`. `o.f ?? d` over a nullable field (`coalField`, legacy's
`emitCoalesceUnionField`) reads its receiver once for the null test and once more on the present
path. The IR can write the second read only when the builder's read can be written again
(`recvReadsAgain`). Two top-level receivers could not be: a list element read through a global,
and a union global narrowed to its record arm. #9733 unmasked the second kind (26 → 35).

## Design

- **Element re-read.** `ir_build_ref` registered an element read in `irReadElem` only when its
  receiver and index were each a variable or an immediate. A global's read is a temp, so it was
  never registered. It now also takes a temp whose own read is written again (`recvReadsAgain`),
  for the receiver and for the index.
  - The registered read is marked `lgAgain`, so no module state carries the mode. On the second
    write, `lowerGet` reads its operands through `irLRecvOpnd`, which writes such a temp's read
    again (`irHoistRecv` of its node) instead of taking it a second time.
  - The second write includes legacy's staging and bounds check, which are fused into the read's
    lowering. That is how legacy re-emits the element read.
- **Narrowed global's box.** A field coalesce whose receiver legacy casts itself (`cfCast`) reads
  it at its storage (`storageReadOf`). For a union global, that storage is now the global's box
  (`globalBoxSymOf`). It is registered in `irReadAgain`, as legacy's `emitIdent` re-emits
  `global.get` before its cast. Before this, the read fell through to the narrowed read, a record,
  which the coalesce's box-receiver check refused.

No legacy code changes and no verifier relaxation. A registration on the narrowed variant read
itself (`RBoxNarrow`) was tried and dropped: it changed no program in the class.

## Legacy tails the IR calls

- None new. The second element read is the existing `lowerGet` tails (`refListGetTail`,
  `scalarListGetTail`, `strListGetTail`, `rawStrGetTail`). The box re-read is the existing
  `RGlobalGet` lowering.

## Open

Four field-place functions remain, each with the receiver in another shape:
- `kept-maker-record-copied-into-union-member-runs` (a nested field receiver);
- `coalesce-arm-nullable-field` (an anonymous arm record);
- `mixed-union-list-nested-null-leaf` (a field of a narrowed field);
- `map-binding-adopts-delivered-map-type::sink` (a narrowed local).

## Also covered

- `byElem` in `tests/ir-shadow-rows/union-eq-read-again-kinds.vl` (`gs[1] != "b"`, a union compare
  over an element of a global list) was a pinned `uncovered union compare box`. The element re-read
  covers it: its receiver's read is written again, so the element is registered in `irReadElem`
  and written again for the compare's later read. The row now expects all 5 functions covered.
