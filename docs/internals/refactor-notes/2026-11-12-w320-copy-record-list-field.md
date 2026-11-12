# The record copy copies a list-of-records field element by element, 2026-11-12

Lane w320, stacked on #7412. Checker gate plus emit; closes D15722.

**The gap.** `function mk() { { xs: [{ f: 4 }] } }` delivered at `{ xs: J[] }` (`J = { f: i32 |
null }`) and called again un-annotated was check-clean invalid wasm: the record copy's rule admitted
a list field only of numbers.

**The change.** `recCopyBoxesAt` (check_fit_rules.vl) admits a list field of records whose element
passes the same rule, one level down. In emit, `emitRecListCopyTop` (wasmEmit.vl) is the element
loop both copies share: the list-result copy (D15826) and a list field inside a record copy. Each
element is read off the loop's own locals (`rcElemSL`/`rcElemIL`, through `rcReadSource`), so no
staging slot is shared with the enclosing record copy, and a nested loop takes the next pair of
temps (`rcLoopDepth`). The registers reset with the emitter's per-program state.

**Graded.** `scripts/capability-probes/matrix/kept-maker-delivery-record-list.matrix.vl`: 3 of 128
ran on #7412's seed; now 122 of 122 graded, 6 owed refusals (the held-binding cells in both faces:
a named binding's mutable list is not split by a copy). D15722's witness runs. Fixture:
`tests/cases/structs/kept-maker-record-list-field-copied-at-wider-row-runs.vl`.
