# IR soundness: an operand that stores declines after an earlier operand (2026-11-24, lane IR-N11, D17109)

Express fix for a clause-1 wrong value in the IR's claim. An assignment used as a value is built
as a store statement, then its value. An earlier sibling operand that is a variable or an
immediate is written at its reader, after the statements, so the store lands above it. On master,
`two(b, b = 2)` printed `22`, not `12`. The armed shadow flags these functions (`bytes: call`), but
no corpus cell or tests/cases program had the shape.

- **`irBStageLeads` (ir_build.vl)** misses (`store after an operand`) when a later operand holds a
  store statement (`storeFrom`). It serves call arguments, concat parts, and array and record
  elements. An earlier temp cannot wait across the store either, so it misses whatever the earlier
  operand is.
- **`ifBelowLeadOf` / `ifBelowLeadIn`** treat a store like a valued `if`: the binary-operator, `==`
  and method paths decline too. `storeAt` names the five store statements, and `storeFrom` and
  `ifBelowLeadIn` share it.

Declining is the safe close, because legacy writes these in order. Staging the leads, as
`irBStageLeads` stages a valued `if`'s, is the coverage follow-up.

## Measured

Base 334f6958, both seeds fixpoints.

- Class audit, 112 cells: 10 writers (`b = 2`, `b = mk()`, `b += 2`, a field, an element, a
  global, a captured cell, an effectful call, `f64`, an unwidened `i64` cell) × the call argument
  (scalar and union parameter), nested argument, binary operator, `+` operand, interpolation hole,
  record field, array element and `==`. Base: 24 wrong. Head: 0 wrong, and none with a lowered
  mismatch.
- D17110: the invisible siblings (a callee or literal reordered past a store to another cell) now
  decline as well.

Pins: `tests/cases/assignment/value-after-a-lead-{i32-lit,i32-reread,i32-compound,i32-capture,f64-lit,f64-reread}.vl`
(the wrong writers), `...-string.vl` (D17122's string `+` and interpolation) and `...-other-writers.vl`
(field, element, global and effectful call).

## Legacy tails the IR calls

None new.
