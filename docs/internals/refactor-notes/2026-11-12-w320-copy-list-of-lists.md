# The fresh-call copy converts a list of lists elementwise, at any depth, 2026-11-12

Lane w320. Stacked on #7424 (D15722, the record-list field). Check and emit.

**The defect (D15723).** A call whose record result has a list-of-lists field, delivered to a
record whose field stores the inner element differently (`{ f: i32[][] }` into `{ f: i64[][] }`),
was refused: the copy gate's `lists` arm admitted only a scalar widening or a record element.

**The change.** `recListElemCopies` (check_fit_rules.vl) recurses on the element type: a widening,
a record element (through `recCopyBoxesAt`), or a list whose elements the same rule copies, bounded
by the copy depth. On the emit side, `emitListConvTop` (wasmEmit.vl) is the one list conversion
the field copy calls: a scalar list widens, a record list copies per element, and a list of lists
loops and recurses one level deeper. `emitScalarListWidenTop`'s two temps are keyed by
`rcLoopDepth`, so an inner widen does not overwrite the outer loop's index.

**Proof.** `kept-maker-delivery-list-of-lists.matrix.vl`: 122/122 graded plus 6 owed (0 before).
Fixture `kept-maker-list-of-lists-field-widened-at-wider-row-runs.vl`. Two check-skip cases
re-spelled to a nullable-list delivery, which the copy still does not convert.
