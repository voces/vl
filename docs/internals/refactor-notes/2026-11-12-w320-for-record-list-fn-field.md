# A `for` loop over a list a record holds, calling through an element's function field, 2026-11-12

Lane w320. Check and emit. Row D15804 (w308's, D15801's list-in-a-record family).

**The defect.** The one-result judge's field lift (`holeSlotFieldLift`) did not apply to a read
rooted at a `for` loop's element of a list a record holds (`holeSlotLoopRooted`), because the
emitter walked such a loop at the record's own field row: `for e in mk().a { e.f(3) }` was refused
at check where `mk().a[i].f(3)` runs.

**The change.** `forInVarStructIdx` (emit_classify.vl) falls back to the ref-list slot the list is
emitted at (`refListSlotOfExpr`, what an element read of it asks) where the list's storage row
(`listRowOfExpr`) does not resolve, as for a field of a call's record. With the loop variable at
the built row the lift applies to the loop too, and `holeSlotLoopRooted` is deleted.

**Proof.** `record-held-list-fn-field-for-loop.matrix.vl` (new): 0 before, 24 of 60 graded, 0
silent, in line with the index-read template `record-list-fn-field-two-results` (26 of 60). The
annotated face's refusals are that template's. Four capture cells move from a check reject to an
emit reject (`a ref list's element row does not resolve`): a list `mk().a` bound in a function
frame and captured is refused at emit for an index read too, on master; handed to w308. Fixture
`for-loop-over-record-held-list-fn-field-runs.vl`.
