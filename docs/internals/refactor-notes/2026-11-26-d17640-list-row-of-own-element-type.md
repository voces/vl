# D17640: a list literal takes the list its own element type keys (2026-11-26, lane COV-START)

Writing the array-element retag sweep found D17640. A list literal of records shares a declared
record's field names, but a function field has another signature. On legacy and on the IR alike, it
stopped at `emitProgram: ref valtype with no interned shape`.

## The mechanism

The literal's element type has the same rep key as the declared record, since both function results
lower to an i32. So the declared record's struct row serves the elements (`repRowOfTyStruct`). The
direct binding does the same and runs. The list's wrapper row was minted keyed by the literal's own
element type, but `arrLitRowSlotIn` looked it up by the declared record's type (`arrLitRowTyIn`),
which keys no list. When that lookup misses, `arrLitRowSlotIn` now takes the list the literal's own
element type keys, before its inner-rows fallback.

## Measured

| program | master | head |
|---|---|---|
| D17640's witness | loud emit reject | runs, prints `11` |
| `tests/cases/structs/list-of-record-beside-declared-record-with-another-field-function.vl` | loud emit reject | runs |

- The sweep covers a module binding, one beside a value of the declared record, a function's local,
  a returned list, two elements, and a walk. It prints the same output on legacy and under
  `$VL_IR_STRICT=1`. The IR still declines its elements (`array element coercion`), which the
  element retag change addresses separately.
- `distilled/regress.vl`: see the PR.
