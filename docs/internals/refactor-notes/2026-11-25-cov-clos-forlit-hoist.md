# I8 re-entry: a `for` iterable's frame-local element (2026-11-25, lane COV-CLOS)

## Mechanism

A `for e in [..]` literal whose elements may each be one constant is hoisted to a module constant
list (`forLitHoistPlan`). An identifier element counted as "may be", and the plan lowered it into a
scratch buffer through the expression emitter (`arrLitDataElemExpr`) to learn that it was not. The
IR asks the same plan (`hoistInRangeCopy`), so a claim re-entered `emitExpr` there. Under the I8
sweep that is the `reentry arrLitDataElemExpr` cause, and its 4 programs were:
`tests/cases/generics/for-in-iterable-at-pin-any-spelling.vl`,
`for-in-over-literal-of-element-read-at-pin.vl`, `for-in-over-mixed-reads-at-pin.vl`, and
`for-in-var-at-literal-union-pin.vl`. Each has `for e in [x]` over a parameter.

The plan now declines an element that reads a frame local before lowering anything
(`forLitElemReadsFrame`). The exceptions are a local an unrolled copy binds (`urSlotUnrolled`), which
reads as that copy's constant, and a read a tag leaf stands for (`fnTagLeafEmitted`). Every other
local read is a `local.get` or longer, never one constant, so the answer is the one the scratch
lowering gave.

## Measurement

* The outputs are byte-identical. All 239 programs under `tests/cases`, the distilled corpus and the
  capability probes that contain a `for … in [` literal and build were built by the base seed and by
  this tree, and `cmp` matched every pair, with no exit-code change.
* For the probe, `arrLitDataElemExpr` was instrumented to `emitFail("DBG arrLitDataElemExpr")`, and
  the 4 programs were built at `VL_IR_SHADOW=5`. On the base tree each program fired 3 times (the
  control). On this tree each fired 0 times.
* I8 sweep: `reentry arrLitDataElemExpr` is gone, and it is removed from `sweep-baseline.txt`.

## Parked: a box over a valued `if` (a lowering prerequisite)

Coordinator ruling, 2026-11-25: "box of a valued if" (23 rows) stays open. It needs a lowering that
writes a single-use valued `if` as its box operand after the tag. The builder side was prototyped
(a box lead over the value span). The lowering's stack-order guard in `leaf()` ("operand above a
valued if's value") refuses it, and the prototype dropped 7 claims across 5 functions. So the
prerequisite is a live-stack change in `ir_lower.vl` that lets an operand sit above a valued `if`'s
value. The builder side should land only after that.
