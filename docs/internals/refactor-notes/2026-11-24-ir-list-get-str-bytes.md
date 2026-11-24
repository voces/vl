# IR: list `.get(i)` and string `.bytes()` (2026-11-24, lane IR-D1)

The probes batch's PR2: mechanisms C and D. Every `xs.get(i)` missed as `method get` and every
`s.bytes()` as `method bytes`.

## Mechanism C: `xs.get(i)`

Legacy writes `.get(i)` with `.pop()`'s body (`emitPop` with `getIdx`): it marks the call's
operands (`listGetStageMark`), resolves the receiver as a pop does (`listOpRecvLocal`), syncs a
view (`emitListGetViewSync`), then runs the same scalar or ref tail, whose condition and element
read each write the index from the call (`pushTakeCond`, `pushTakeElem`). `RListPop` gains `lqIx`,
the index operand. The builder routes `get` to it. The lowering opens and closes legacy's markers
(`listGetStageEnter`, `listGetStageRestore`), stages the receiver as for a pop, syncs, consumes the
index operand unwritten, and runs the shared tail with the index node.

Named misses:
- `get index staged`: an index legacy does not re-read in place (`listGetIdxReReadable`), which it
  tees into its stash on the first read;
- `get index operand`: an index whose build writes nodes or is not an i32;
- `coalesce listGetOr`, already named: `xs.get(i) ?? d` over a scalar list, legacy's fused read.

A receiver legacy stages (a field, a call) is claimed: the staged path is pop's, and
`list-get-staged-receiver.vl` matches.

## Mechanism D: `s.bytes()`

`StrOp` gains `bytes`; the lowering writes the receiver then `strBytesTail`, moved out of
`emitStrBytes` unchanged.

## Verifier

- `RListPop`'s `lqIx` holds at most one operand, an i32: `get-of-list` holds (0);
  `get-index-of-string` is refused (2).
- `bytes` yields a list of u8s off a string: `bytes-of-string` holds (0); `bytes-of-i32` is
  refused (2).

## Readings

READINGS

## Legacy tails the IR calls

`popRefTail`, `popScalarTail`, `emitListGetViewSync`, `listGetStageEnter`, `listGetStageRestore`,
`strBytesTail` (wasmEmit.vl); the last three new, `strBytesTail` moved.
