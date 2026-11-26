# COV-CALL: nested fused `xs.get(i) ?? d` (2026-11-26)

Lane COV-CALL; census rows `coalesce listGetOr after an operand`, `coalesce listGetOr index
operand` and `coalesce popOr after an operand` on CENSUS's nested-stash programs.

## Mechanism

Legacy's fused head reads its receiver and index twice and stages a non-re-readable one in the
`.get` stash. #10254 held a call receiver in a once-slot that the lowering wrote just before the
head. Its value was still a pending temp while the index was built, so an index holding its own
fused `??` refused (`after an operand`). An index that built statements refused too
(`index operand`).

- **IR-owned locals.** The builder holds such an operand in a slotless `local`
  (`heldInLocal`: an `SAssign` from the operand). The lowering gives a slotless local assigned
  outside a valued frame a local of its own (`ownedSlot`, an `irOnceSlotAt` row keyed by the
  variable; `lwOwnedSlots` reset per function). `varSlot` answers with it. Nothing waits on the
  stack after the hold, so a nested fused `??` builds.
- **Receiver.** Any non-re-readable receiver value is held, not only a temp chain. A re-readable
  receiver's pure read waits aside while the index builds, then goes back before a plain index or
  after an index's statements. The lowering skips it and legacy re-reads it at the head.
- **Index.** An index that built nothing is legacy's own re-read. One temp keeps #10254's
  once-slot (`irGetIdxBegin`), and any other is held.
- **Legacy.** `listGetRecvHeld` and `listGetIdxHeld` are set around the head's open whenever the
  IR hands that operand, so `listGetStageMark` stages neither.
- #10254's `irGetRecvOnce`, its slot stack and `listGetRecvWrapOf` are removed.

## Proof

- **Census**, CENSUS's nested programs (ten, the hoisted spellings included):
  `list-get-nested-stash-f64`, `-f64-hoisted`, `list-pop-nested-stash-control` and
  `get-or-default-receiver-first` are fully claimed. The others' start bodies now first-miss on the
  plain `.get` builder (`get index operand`, or `coalesce listGetOr after an operand` raised by a
  plain `.get` whose index is a fused `??`), a separate builder. On a current-master seed all
  ten start bodies missed in this family.
- **Q58:** `tests/cases/lists/get-or-nested-operand-positions.vl` nests a fused read in the index
  (twice and three deep), in a global receiver's index, in the receiver, and in a miss's default.
  It covers a `const`, an argument, a function, a float list and an inner miss; a call counter pins
  single evaluation. On the master seed one function and the start body miss on `after an
  operand`. On this branch all are verified, and the armed run prints the `@log` list. #10254's
  `get-or-temp-receiver-positions.vl` stays verified with the armed run equal.
