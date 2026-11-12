# Step 7: a spread literal's emitter-made run has its holder's element kind, 2026-11-11

The emitter (`spreadRunLit`, `wasmEmit.vl`) makes a list literal of the plain elements beside
a spread, or of a variadic push's arguments. It is built at its holder's type and records no
type of its own, so `arrLitElemKind` read its shape. It now reads the holder's recorded type
(`elabSpreadRunHolderOf`) when the run has none.

## Measurement

Fixpoint seeds on both sides, over the whole sweep population. The base is #7301's tree
merged with master. Result: same 23,925, bytes-only 0, output movers 0, runs → not-runs 0,
new compiler traps 0.

The rejected alternative was recording the holder's type on the run node itself. It moved 5
cells bytes-only. Three of them grew by 4 types (D15370 and two `soundness/record-*-list-*`
cases): the mint then keyed the run's rows a second time, so one canonical row was stored
under two keys. Only the kind reader reads the holder.

## The shape reader's remaining floor

An `emitFail` probe on its remaining call fires on 7 cells, every one a hole or type parameter
element: `T[]` in the four `d581_*_typar` named cells, `_[][]` in D15637 and
`hole-param-called-and-handed-on-in-nested-list.vl`, and `T[][]` in
`return-join-nested-type-param-list.vl`. No cell lacks a type any more.
