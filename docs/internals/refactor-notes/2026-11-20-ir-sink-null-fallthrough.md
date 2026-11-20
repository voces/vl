# IR: a null fall-through into the union return sink (2026-11-20)

A function returning a union box can take legacy's return sink. Each return pops its box into a
pair and branches to an exit block wrapped round the body. When such a function falls off its end
into the `null` its result bears, legacy writes that `null` and terminates it like any return
there (`emitFallThroughPad`, then `emitUnionRetSink`): sunk when it built a box, a plain `return`
otherwise. The IR's `lowerBody` refused the case (`null fall-through into the return sink`) as a
lowering miss, which the armed shadow reports as a claimable function that did not match.

The return exit is now one function, `sinkExit`, which both `ret()` and the fall-through pad call:
the sink peephole where the last write built a box, else `return`.

Not taken: `tail if union sink`. Admitting a union-sink tail `if` whose arms end in a bare value
mismatches legacy in two self-compile functions (`use`, `irLOpnd`). There, legacy writes the arms'
values as dropped statements and pads with `null`; the checker's own "this value is discarded"
warning agrees. Admitting only arms that each `return` moves none of master's 10 such functions,
since all of them end in a value. The rung stays as it is.

Measured at the merge-base in the PR.

Legacy lines deleted: 0. Moved to `@ir`: 0.
