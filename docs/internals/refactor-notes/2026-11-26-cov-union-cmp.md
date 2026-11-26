# A union compare's operand read at its use (lane COV-UNION, 2026-11-26)

## The rows

`union compare operand` in regen-10/11: `union-closure-arm-equality.vl` `@start` and the
distilled named cell `ug_rv3313_g1_sn__b__lit__ret__eq__one.vl` `@start`.

## The change

- **Both read again on the null leg.** Legacy reads the operand first, then the box, re-reading
  each global at every use. The lowering (`unionNulEq`) writes the operand first, so when the box is
  also a temp read again, `opndAboveBox` moves the operand's one read above the box's, so the two
  temps settle in order. The verifier's `ucOtherAgain` rule now accepts a box read again
  (`ucAgain`) beside it.
- **A closure of a function with no environment** (`RMakeClo`, empty `mcEnv`) reads no value and
  has no effect, so off the null leg it is written at its use inside the tag's `if`, as legacy
  reads the function's closure there (`envlessCloAt`).
- The third row, a module `let` its initializer narrowed (`union-eq-narrowed-let-operand.vl`,
  `union compare operand rep`), is START-2's #10425 (`unionEqSide` reads it under
  `storageReadEnter`); this change adds no reader of its own for it (coordinator check
  2026-11-26).

## Measured

- Sweep `tests/cases/unions/union-compare-operand-positions.vl`: master blocks four functions and
  the start body; on the head none block, no byte mismatch, `@log` holds under
  `VL_IR_REQUIRE_CLAIM=1`.
- Census A/B (base 2dd28397e, before #10425): the three units were claimed; cases unclaimed 217
  to 215, the distilled population 1 to 0; nothing lost. After merging master (#10425), the
  narrowed-let unit is master's; this change keeps the other two. `ir-identity --cases`: 0 differ, 167 of 167 behave the
  same.
