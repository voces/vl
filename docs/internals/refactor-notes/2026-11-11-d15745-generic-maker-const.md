# D15745: a generic maker returning a `const` of its record literal widens the field, 2026-11-11

Clause-2 close, found closing D15743. Base is #7270's head.

`holeSlotCallRetRecs` (check_relate_core.vl) took a generic maker's returned values only when each
was a record literal. It now also takes a returned `const` the maker's own body declares with a
record literal, and hands the literal on (`holeSlotRetRecLit`). A write the maker makes to that
`const` before returning it (`o.g = k2`) is read by the existing widening, and is kept.

**Sweep** (`scripts/sweep.vl`, #7270's seed against the fixpoint candidate): 23,918 same,
0 bytes-only, 0 output movers, 0 runs → not-runs, 0 new traps; D15745's witness and the fixture
are new to the population and run.
