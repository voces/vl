# A value `if` joined at a record's row is legacy's reference join, its narrowed arm unboxed (2026-11-24, lane IR-N5)

A value `if` whose arm is a union binding narrowed to a record arm, at a record or nullable record
destination (D2907, D4561, D17026), is written by legacy as a reference join at the record's row
(`ifJoinPlanOf`'s `ref`), each narrowed arm recovered from its box in the arm (`refIfArmOf`'s
`unbox`: `struct.get $box 1; ref.cast (ref $rec)`). The IR's `ifExprPlainWhy` answered `union` for
any union-typed join ahead of its reference rung, so `ifExprAt` sent the join to `unionIfExpr`,
which missed as `union if rep` (19 functions and a start in tests/cases).

## The change

- `ifExprPlainWhy` (asked only by the IR) answers `ref <kind>` for a reference join at a record's
  own row (`joinKindIsRecord`) ahead of the `exprUnion` fallback.
- `refIfArm` builds the `unbox` arm: the narrowed box recovered at the join's record through the
  existing `RArmUnbox` temp (`armUnboxTemp`, or `recordArmsUnboxTemp` for a union of records).
- The direct-call argument at a record parameter is declined (`argument union if at a record`):
  legacy coerces it there as the union box and writes invalid wasm (D17115), which the IR must
  not silently fix.

The ablation needs both: the routing alone moves the 19 functions to `ref if arm unbox`; the arm
alone moves nothing.

New test cases:
- `unions/record-join-unboxes-narrowed-arm-from-a-box.vl`: the box holds an `A` built apart from
  the literal arm's, so a field only that record carries shows which one arrived.
- `unions/record-join-unboxes-narrowed-arm-in-each-position.vl`, the position sweep: a
  union parameter, a return, a binding, an `if` arm, a `??` operand, a record-literal field, a
  concatenation and an interpolation hole.

## Not in this change

- A field read straight off the join (`(if x is A { x } else { d }).v`) is refused by legacy at
  emit on master: D17108, filed from the sweep.
- A record parameter or a nested call taking the join is check-clean invalid wasm on master:
  D17115, filed from the sweep; the IR declines that position until the row closes.
- An unbox arm that is a maker call, not a narrowed local, misses as `ref if arm unbox shape`
  (`records/value-if-of-maker-call-and-literal-at-declared-record*.vl`,
  `records/maker-calls-in-two-joins-at-declared-record.vl`).
- `unions/coalesce-narrowed-out-of-box.vl` keeps one `narrowed read niche kind` function.
- Correction to `2026-11-24-ir-for-in-nullable-arm.md`: that change moved 4 tests/cases starts,
  not 3.
