# IR: a void labelled block, 2026-11-22

Lane IR-N4, control flow. #9561 exposed `labelled block` as the third-largest tests/cases class:
73 functions in 28 programs. `whileStmt` refused every `WhileStmt` with `whileBlk` or `whileLv`.
An ablation by shape (a diag seed counting `whileBlk` and `whileLv` at the refusal) split it:

| shape | functions | programs |
| --- | --- | --- |
| labelled block carrying a value | 41 | 19 |
| void labelled block | 23 | 7 |
| `while` carrying a value (`break v`) | 15 | 7 |

This change takes the void labelled block, legacy's `emitLabelBlock` with no `lvFrameOpen` value:
one `block` frame, its body, `end`. It is an `SBlock` whose label is on the break stack, with no
continue label (`ibLoopCont` -1). `contIx` skips such an entry, as legacy's continue stack holds
loops only. The parser already refuses a bare `break` or `continue` inside a labelled block.
`loopOpen` hoists nothing for one, as `emitLabelBlock` opens no loop.

A loop value (both valued shapes) stays a named miss, `loop value`. It rides legacy's typed
frame through the result binding's local, which is the next change.

The shadow row is `tests/ir-shadow-rows/labelled-block-void.vl`.
