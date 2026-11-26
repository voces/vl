# `recValRetag` compares like with like: the built row's heap (lane COV-START, D17672)

**What.** `irVarHeap` holds the struct ROW a struct literal's temp is built at (`builtAtRow`),
`irRecHeap` holds HEAP indices. `recValRetag` compared them directly; it now compares
`structRowHeap(row)`. `irVarHeap`'s field, accessor and note now say row. Coordinator ruling
2026-11-26: the fix goes ahead of COV-START's regen-10 list, as the accessor's contract.

**Measured.**
- A probe at `recValRetagNoted` over all 27,421 programs (tests/cases, witnesses, probes,
  distilled) reaches the comparison 9 times. 3 have row ≠ heap (`let-copy-of-fn-record-b4-closure.vl`:
  row 4, heap 2, destination heapless), and none flips the answer, so the corpus does not move.
- D17672's repro (a twin pair ahead of a nested twin literal) flips it: row 4 on heap 3 into a
  destination on heap 3, refused before, accepted now. Its function still misses later
  (`return coercion nested twin`), so no claim moves.
- The verifier selftest `value-retag-built-heap` now notes rows past heaps 1 and 2
  (`selfRowsOnHeaps`, removed after the case). A compiler with the old comparison fails it:
  `want rule 0, got rule 2`.
