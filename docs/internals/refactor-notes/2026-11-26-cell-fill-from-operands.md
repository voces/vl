# IR: a function-value cell filled from the frame's operands (lane COV-CLOS, 2026-11-26)

A capturing nested function read as a value from more than one frame lives in a function-value
cell (D7700): the first read in an activation builds its closure into the cell
(`emitClosureValueOf`), each capture read by name in the reading frame (`emitCaptureRead`,
`captureHomeOf`). The IR's builder handed such a read no environment and its lowering wrote
legacy's fill, which finds a local binding only through legacy's emitter scope: inside a claimed
function it does not resolve. A capture of a binding the frame's body walk cannot reach (a lambda
that names the function reads it through its cell, so the function's captures are not carried)
missed `closure env capture`.

Now, where a capture is a binding of the frame's own body (`cloEnvReadsLocal`: its binding by
`parentBindingOf`, or a loop variable), the builder hands the lowering the environment and the
lowering writes the fill from those operands (`makeCloCell`). A function whose captures are all
parameters or globals keeps legacy's fill.

## Measurements

I8 census over the `tests/cases` programs, the new position test among them (base and head at
master `f550c5892`): `closure env capture` 5 → 1 unclaimed functions (`looped` of
`capturing-nested-function-read-from-another-frame-equality.vl` and the position test's three).
Claimed functions 97,756 → 97,760, claimed starts 8,419 → 8,419, claims fallen back 11 → 11; 0
claimed functions or starts lost, no other class moved. The one left (`counted` of
`maker-delivered-at-two-function-types.vl`) is a hole lambda's capture at a maker instance, another
mechanism.

Q58 position sweep (`tests/cases/closures/cell-filled-closure-over-frame-local-positions.vl`: a
while-loop local pushed, a for-in variable, an if-block local bound and called, a body local passed
as an argument, a local record returned): base 3 functions miss, head 0; output identical
claims-off and on. A partial claims-off ripple (2,719 built `tests/cases` programs) found 0 byte
differences; the merge queue's identity check is the full measurement.
