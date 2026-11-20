# IR coverage: an earlier operand staged below a valued `if` (2026-11-20, lane IR6)

The IR writes a temp's definition at its one use. A valued `if` (`&&`, `||`, a value `if`) is a
statement whose value stays on the stack, so an operand built before it, and read by the same
reader after it, would land above the `if`'s value; legacy writes it below. The builder refused
the shape: `if after an operand` (45 self-compile functions alone) and `short-circuit argument
after another` (56).

## The mechanism

- **Staging (`ir_lower.vl`, `stageLead`).** As a valued `if` opens, the temps pending before
  its condition's are split from the condition's (`irRhsOpnds`, a new operand walker in `ir.vl`).
  Their roots, those no other pending definition reads, are written now in definition order and
  left on the stack; the definition-order check `irLSettle` makes is kept over them.
- **The live stack.** `lwLive` replaces the count `lwStackLive`: the values on the stack, bottom
  first, each with the buffer position it ends at (`lwLiveEnd`). A reader takes the lowest above
  `lwFloor`, and only when nothing was written since the top value ended; else it misses
  (`stack value read out of order`). A consumer that writes bytes between its operands (a push's
  receiver staging) so misses rather than writing a module that does not validate.
- **The floor.** The `if`'s condition may read values already on the stack; its arms read none
  beneath the `if` (`lwFloors`).
- **A staged temp is a value.** `tempRhs` answers no definition for it, and `irLSkip` misses on it,
  so no reader rewrites it from its definition.
- **`RStage` (`ir.vl`).** An operand's own value as a temp. At a call's or an intrinsic's
  arguments, an earlier variable or immediate argument becomes one where it was read
  (`stageLeadArgs`), so the lowering stages every earlier argument in order. A valued `if`'s out
  is already on the stack and stays as it is.
- **The builder (`ir_build.vl`).** The two `if after an operand` refusals go; the short-circuit
  refusals at a binary operator's right operand and a string's later part lift when every earlier
  operand is a temp (`ifBelowLeadOf`). A push, a store and a boxed `??` (`SCoalBox`, which
  stages nothing) keep theirs.

## Lines

| | lines |
|---|---|
| compiler | +375, −32 |
| `ir_lower.vl` | +174, −15 (staging, the live stack, the guards) |
| `ir_build.vl` | +114, −12 (`stageLeadArgs` and its probes) |
| `ir.vl` | +72, −1 (`RStage`, `irRhsOpnds`) |
