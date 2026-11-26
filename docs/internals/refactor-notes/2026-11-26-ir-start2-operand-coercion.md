# START-2: `operand coercion` (2026-11-26)

Regen-10 lists 2 units, two mechanisms at the binary operator's `operand coercion` miss:

| program | operands | legacy |
| --- | --- | --- |
| `bitwise/shift-count-widens-untyped-literal.vl` `variableCount` | `1 << c`, `i32` and an `i64` count | the shift at the left's width, the count `i32.wrap_i64` |
| `closures/mixed-result-fn-list-call-bound-in-block.vl` `@start` | `xs[0](3) + xs[1](3)`, `i32` and `f64` | the `i32` widened to `f64` (`emitBinOperandAs`) |

The shift count goes through the numeric narrowing temp (`nwSrc` 3 to `nwDst` 1). The widening
applies only where `binWidthRep` names no width. It widens an operand narrower than the result's
`f64`/`i64` rep, beside one already at it. The left side is widened right after it is built, since
the lowering reads temps in the order they are defined.

`ir-parity`: byte-identical on both programs.
