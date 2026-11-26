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

MEASUREMENTS_PLACEHOLDER
