# IR: a returned trap (2026-11-20, lane IR-N2)

A hook's unset default is `function unset(): T { return __trap__() }`, and the checker and emitter
hold eight of them (`tagRepTyUnset`, `substCtxLeaked`, …). The builder delivered the returned
value, whose type is `never`, and missed at `rep novalue`. Legacy's return path writes the trap
(`emitCallCoreTrap`, its message streamed first), then the `return` it writes after any value.
That `return` is dead behind `unreachable`, so the stack is polymorphic there and needs no value.

## The change

- `ir_build.vl`, a `return` statement whose value is a `__trap__` call: the trap through
  `trapStmt` (its node the call, as a statement trap's is), then a bare `SReturn`.
- `ir_verify.vl`: `stmt` takes the node before it in its body. A bare return directly after an
  `STrap` is dead, so rule 5's value/result agreement does not apply to it.
- At a wider number (`numKindOf` 3 to 5) legacy's return also widens the dead i32 value
  (`i64.extend_i32_s` or `f64.convert_i32_s` after the `unreachable`). The builder misses there
  by name, `returned trap widened`, rather than write an op over no value.

A `never` function's `return __trap__()` stays the existing `void return value` skip.

## Witness

`tests/cases/intrinsics/trap-returned-at-each-result.vl` has nine unset hooks: `i32`, `i64`,
`f64`, `string` with a message, `boolean`, a record, `i32 | string`, `string | null` and
`i32[]`. Under the merge-base seed every one stops at `rep novalue`. After, seven are covered and
matched, and `i64` and `f64` are `returned trap widened`. The shadow row `RETURNED_TRAP` pins four
of them and the miss.
