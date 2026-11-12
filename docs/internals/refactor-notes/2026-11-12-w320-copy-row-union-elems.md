# The fresh-call copy copies a list of row unions arm by arm, closing D14385, 2026-11-12

Lane w320. Stacked on #7476 (list-element boxing). Check and emit.

**The defect (D14385).** A list of a union of records delivered at a list of one wider record
(`[{ r: { c2: 1 } }, { r: { s2: 5 } }]` at `Circle[]`) had no copy, so D14385's interim refusal
fired at the function's other call. It was the last member shape of the row.

**The change.** `recListElemRecCopies` (check_fit_rules.vl), shared by `recFreshCallCopy` and
D14385's skip (`recCallCopiedAt`), admits a union of records whose every arm the copy's rule
admits into the destination record; `recListElemCopies` does the same for a list field.
`rcRecListsApart` accepts it, and `emitRecListCopyTop` hands each element to
`emitRowUnionElemCopy` (wasmEmit.vl): the box's tag picks the arm, whose record is copied at its
own row (`variantRowOf`, `variantHeap`) by the copy level, read through the box's payload
(`rcElemBoxed`, reset per program).

**Proof.** `kept-maker-list-result-delivery-row-union.matrix.vl` (new): 0 before, 46/46. The
union list-result template's last guarded cell runs (52/52, no owed). Every kept-maker template
unchanged; emitter-state-audit 0. D14385's must-error pin becomes a runs fixture
(`inferred-result-kept-at-own-type-copied-runs.vl`); fixture
`kept-maker-row-union-list-copied-arm-by-arm-runs.vl`. Filed D15892 (two union members sharing
the record's field names, still refused). D14890, the backlog item's other witness, stays open.
