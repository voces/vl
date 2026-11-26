# Push operand / store operand coercion: a list of any sub-word width (2026-11-26, lane COV-START)

`tests/cases/arrays/sub-word-lists.vl`'s start body missed `push operand coercion`, then
`store operand coercion`. A scratch build printed both reps: an `i32` value against a packed
element.
- The push (`pushRhs`, `pushLateRhs`) and the element store (`elemStore`) converted a packed
  element to `i32` only for `u8`, as did their verifier rules.
- An `i8`, `u16` or `i16` list is packed too (`repSubWord`), as the record field paths already treat
  it.

All four sites now ask `repSubWord`. The lowering is legacy's tail, which truncates at the list's
width.

## Measured

- `sub-word-lists.vl`'s start body moves past both classes to `narrowed read`, another class. It
  prints the same output on legacy and under `$VL_IR_STRICT=1`.
- `distilled/regress.vl`: no runs lost. Its movement list is identical to master's seed.
- The sweep `tests/cases/arrays/sub-word-list-push-and-store-positions.vl` covers an `i8`, a `u16`
  and an `i16` list, and a record's `i16[]` field, in a start body and a function. Each value wraps
  at its width. It prints the same output on legacy and under strict IR. Its start body and both
  functions are matched; on master the start body and one function missed.
