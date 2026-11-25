# IR coverage: `method f`, a field call off a receiver that is not a plain record (2026-11-23, lane IR-N8)

`method f` on master 55288c87: 21 functions in 13 tests/cases programs (2 start bodies). Tagging
`callRefPlainKey`'s refusals: 16 are `fieldCallRefPlainHead`'s `!exprStruct(receiver)` (a union box
narrowed to a record arm, a nullable record, a variant), 5 are `!exprIsClosure` (bundle and
null-only callees), which stay.

- **`fieldCallRefPlainHead` (wasmEmit.vl, read by the IR alone through `callRefPlainKey`)** drops
  the struct-receiver clause. Legacy's `emitCallCore` sends any closure-typed non-`Ident` callee
  to `emitCallRef` before it asks about the receiver, and the callee's read (`t0.f`) is the IR's own
  member read, which names its own miss. Under the shadow `legacyPlainAgrees` still checks the
  plain arm legacy took.

## Measured

On the 13 programs, master 55288c87's tree on a one-step seed against this branch: functions
matched 230 → 243, `start matched` 10 → 11, `method f` 21 → 5, 2 moved to `shared member callee
row`; no fail or mismatch.

Row: `tests/ir-shadow-rows/field-call-non-struct-receiver.vl` (base 6 of 12 matched, head 12 of 12,
the same output).

## Legacy tails the IR calls

None new.
