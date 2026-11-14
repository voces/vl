# `emitUnionUnionEq` reads its operands' member sets from their types, 2026-11-14

Lane D, D16032. After lane G's #7928 and #7933, `emitUnionUnionEq` (wasmEmit) was the last reader
that looked a union's row up by its label: three `msSetOfUnion(lname | rname)` calls. They now read
`msSetOfTyAny` of the operand types the function already holds (`lUTy`, `unionEqOperandTy(rIx)`).
`msSetOfUnion`, `unMemRowOfName`, `unionMemberSetOf` and `unionRowOf` lose their last callers and
are deleted. What still reads the label index (`unRowBySid`) is its bind guards and the A/B shadow
harness.

## Measurement

A probe at the three sites over the 19,744-record population (`tests/cases` and the distilled
corpus), master `875f5c7`. It compares the label's set id with the type's:

| site | same | differ | label none |
| --- | --- | --- | --- |
| struct-union gate (`lname == rname`) | 28 programs (161) | 1 (1) | 1 (1) |
| left set | 21 (65) | 1 (1) | 0 |
| right set | 21 (65) | 1 (1) | 0 |

The `differ` program is `tests/cases/operators/union-eq.vl`: the label's set is the softened
`string|i32`, while the operand's type `"x" | 7` keys a literal-keeping set with the same member
types. The `label none` program (`unions/union-eq-non-binding-both-operands.vl`) has no row for
`f64|string`, where the old read fell back to the type.

**Byte comparison** of master `875f5c7`'s fixpoint compiler against this change: the 31 programs
that reach `emitUnionUnionEq`, 31 SAME.
