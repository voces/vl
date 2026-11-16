# The layout sentence for a misfitting write through a rewritten parameter (D16707), 2026-11-16

Lane WIDTH. This changes a diagnostic only. The refusal was owed (DECISIONS "Width subtyping
reaches nested fields"); its sentence was the capability gap's.

## What changed

- An instance that refuses a write through a declared record parameter undoes the width
  rewrite, as before. The call's argument then keeps the field-dropping capability sentence.
- `callFtyArgAssign` notes each refused argument to a parameter the rewrite declined
  (`wsNoteArgRefusal`, `check_width.vl`). At the end of the check, `slotContractWords` scans the
  callee's body for a write through that parameter whose record misses fields the argument's
  real layout stores (`slotParamWriteWords`). If it finds one, it replaces the refusal with the
  layout sentence: the write, its line, and the fields it misses.
- The note sits in `check_width.vl` because `check_calls.vl` importing `check_width_slot.vl`
  closes an import cycle.

## Measurements

| instrument | before (master) | after |
| --- | --- | --- |
| `record-nested-width-existing.matrix.vl` with the new `param_write_misfit` cell | 74 of 74 graded, 8 owed; the new cell has the capability sentence in both faces | 74 of 74 graded, 10 owed |
