# IR: one string operand builder, `strPartAt` (2026-11-26, COV-CALL)

**Mechanism.** Two builders write string operands. Concatenation (`ir_build_ref.vl`) decoded a
literal-union part through `deliverStr` and built every other part as it stands. The
accumulator append (`accAppend`, `ir_build.vl`) built every part as it stands. Either one
missed `string operand coercion` when a part did not arrive as a string. Legacy's
`emitStrValue` writes three kinds of part:

- a literal-union part decodes to its member;
- a dead `never` read is `unreachable` at the string;
- a call that never returns is the call, then dead code.

`strPartAt` is now the one builder for both sites and makes all three. The never call is built
as a statement (`efRhs`), then the dead string (`RDeadNever` at the string rep), as #10286's
`deadCallAfter` does for an argument.

**Census.** The regen-9 class `string operand coercion` has 3 programs and 3 units, all claimed,
each printing its `@log` armed:

- closures/never-function-value-call-positions `concat`
- literal-unions/eq-literal-narrows-as-is `inLoop`
- unions/lint-union-let-no-melt `atoms`

**Q58.** `tests/cases/strings/string-operand-built-as-string-positions.vl`. On the master probe
4 of its 8 functions miss `string operand coercion`. On this branch all 8 are claimed, and the
armed run prints the `@log` list.
