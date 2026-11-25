# IR operand order: an operand before a box-lead span (2026-11-25, lane COV-IS)

- **The misses**: `box of an assignment after an operand`, `string operand after another` and
  `short-circuit argument after another` (and its array-element and field spellings) are one
  mechanism. An operand built before a box whose plan leads its value (`holeBoxLeads`) over a span
  (an assignment's store, `asgSpan`; a tag dispatch's stash, `irBoxLeadFirst`): the lowering wrote
  the box's head at the span's first node (`dispatchBoxHead`), above the earlier operand, while
  legacy writes that operand first. The builder declined each spelling (D17564's closing stance).
- **Legacy**: `two(b, b = 2)` writes `b`'s box, then the second box's tag, the store and the
  value; `"\{b} \{b = 2}"` writes the first `toString` call before the second box's tag.

## What landed

- **The lowering** (`boxLeadStage`, `ir_lower.vl`): at a box-lead span's first node, the temps the
  earlier operands left pending are written as roots (`stageLeadOf`), and the floor is raised until
  the box node is written (`boxLeadUnstage`), so the span writes above them. The roots stay on the
  stack for their reader, as below a valued `if`. `lwLeadBoxes` is saved and restored with
  `lwFloors`.
- **The builder**: `irBStageLeads` stages earlier operands below a box-lead span
  (`dispatchBoxFrom`, `boxLeadSpanFrom`) instead of declining it, and `boxTempIn` drops its
  `box of an assignment after an operand` guard.

## How it was measured

- **The class**: the 8 `tests/cases/assignment/value-after-a-lead-*.vl` programs match in full
  under `VL_IR_SHADOW=2` (`f64-lit` keeps its two `box ladder` rows, an `asgLit` box), and so does
  `closures/tag-dispatch-call-after-an-operand-positions.vl` (D17564's fixture: 2 string-operand, 1
  argument, 1 array element, 1 field and 1 start body missed on master).
- **Q58 position sweep** (`tests/cases/assignment/assignment-after-an-operand-box-positions.vl`,
  new): a call's second and third argument, a record field, a list element and an interpolation
  hole. On master 5 functions are `box of an assignment after an operand`; here all 68 match.
