# COV-CALL: a call through a field that no function reaches (2026-11-25)

Lane COV-CALL, class `method f`. The census probe splits this class by reason (`censusPlainWhy`):
the field is `not a closure`, and the field or its receiver is typed `null` or `never` in the
instance (13 of 21 rows), or the call goes through a bundle record's field (8 rows, left).

## Mechanism

Legacy's `emitCallCore` sends a non-name callee that no closure, place-record, result-member or
UFCS rung takes, and that is typed `null` or `never` (or whose field's receiver is), to
`emitNullCalleeCall`: one `unreachable`. `emitCall` then pads it with a second where the call is
typed `never` (`callEndsNever`). As a statement, `emitCallStmt` drops a member call that yields a
value.

- **Shared predicates (wasmEmit.vl):** `calleeTypedDead` holds legacy's four type tests, which
  legacy's tail now asks. `callCalleeDead` is the whole routing answer the IR asks. `ufcsCallName`
  is the pure half of `emitCallCoreUfcsNode`, which builds an arena node.
- **Builder:** the `method` branch returns `RDeadNever` with `dnPad = callEndsNever(ix)`.
- **IR:** `RDeadNever` gains `dnPad`. The lowering writes the second `unreachable`, and gains an
  effect arm: `unreachable`, the pad, then `drop` where `memberCallYieldsValue`.

## Legacy is byte-identical

The master seed and this branch's fixpoint seed build every program to the same bytes, with equal
exit codes: `tests/cases` 0 of 9,422, distilled + capability probes + class witnesses 0 of 18,150.
The self-compile is identical too.

## Census (class programs, `CENSUS_CLASS=classes/method-f.txt`)

| row | before | after |
|---|---:|---:|
| `method f` | 21 | 8 |
| newly exposed first misses (other classes) | | 6 |

The 8 left are the bundle-record family: a call through a field holding a bundle record. The 6
newly exposed, each one function, are `expression if optional guard` (2), `optional read of
null`, `string operand after another`, `open local type` and `map get rep`. There is no claim
fallback.

Left: `G` in `hole-guarded-call-through-null-*` (2 rows, class `call of a non-declaration`), a
*name* typed `null`. Legacy prints its `unreachable` through `__print_i32__` while the IR's print
takes the arm `printArmOf` names, so it needs the print arm settled first.

## Proof

- Q58 sweep: `tests/cases/closures/dead-field-call-positions.vl`. The dead call is printed, passed
  as an argument, returned and made a statement. It is also a `?.` call off an only-`null`
  receiver, under `??` and as a statement, and a call through a declared record's `null` field.
  On master the IR claims 3 of its functions; with this change it claims 6, byte-identical under
  `VL_IR_STRICT=1 VL_IR_SHADOW=6`.
