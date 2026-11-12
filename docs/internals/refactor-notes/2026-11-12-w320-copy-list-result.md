# A fresh call's list of records is copied element by element where it lands, 2026-11-12

Lane w320, stacked on #7404. Checker plus emit; closes D15826.

**The gap.** `function mk() { [{ f: 4 }] }` delivered at `J[]` (`J = { f: i32 | null }`) and called
again un-annotated built one list at two storages: check-clean invalid wasm. `recFreshCallCopy`
copied only a record result.

**The change.** `recFreshCallCopy` (check_fit_rules.vl) also copies a list of records whose element
passes the record copy's rule (`recCopyBoxesOnly`), recording the list type in `listCopyTyIx`, and
the list-result arm of `recAdoptNote` offers it before building the literal at the destination.
`emitRecListCopy` (wasmEmit.vl) copies the emitted list element by element in the ref-list copy
loop: each element is staged in `variantReboxSlot` and copied by `emitRecCopyLevel` at the element
types (`rcElemSrc`/`rcElemDst`). `listRecCopies` reserves the slot (`scanStashes`).

**Graded.** `scripts/capability-probes/matrix/kept-maker-list-result-delivery.matrix.vl`: 0 of 46
ran before; now 46 of 46. D15826's witness and its `f64` and nested-list twins run. Fixture:
`tests/cases/lists/kept-maker-list-result-copied-at-wider-list-runs.vl`.
