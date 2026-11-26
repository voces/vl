# A lead below a `??` written in place (lane COV-UNION, 2026-11-26)

## The row

`short-circuit right operand` in regen-10, where the right operand is a `??` written in place
(`SCoalBox` whose arm does not stage leads; `stmtClassOf` class `coalInPlace`). Legacy writes
`lead + (x ?? d)` as one expression tree: the lead first, then the `??` as an inline valued `if`
whose operand head it re-writes in each arm. The IR leaves the box's out on the stack at its use,
so a lead read at its use (an immediate or a variable) would land after the box; `stageLeftBelow`
refused every in-place `??` in a right operand.

## The change

The lowering already writes a box head after the pending temps (`coalBox`: `stageLeadOf`, the
floor below the pending temps, `joinBoxHead`). So `stageLeftBelow` now stages the lead
(`irBStageLeads`) below an in-place `??` too, as it does below a valued `if`. The spill fallback
keeps excluding it, and a receiver stage stays refused. Coordinator OK 2026-11-26 on the mechanism
note.

## Measured

- Sweep `tests/cases/unions/coalesce-in-place-right-of-a-lead-positions.vl`: master blocks 8
  functions on `short-circuit right operand`; on the head none block, `VL_IR_REQUIRE_CLAIM=1` exits 0
  and the `@log` lines hold. Two subtraction rows print a negative number if the lead lands after
  the box.
- Census A/B: `value-arm-prelude-any-position.vl` `coalesce`, `shared-field-opt-coalesce-in-each-position.vl`
  `glob` and `loop` move to claimed; unclaimed 257 to 254; nothing lost.
- A lead with an effect (a call, an assignment) misses earlier on `coalesce optional after an
  operand` on master and on the head; that row is work order item 6.
- `tests/vl_ir_shadow_test.ts`: the two fixtures that used `k + (g.j?.a ?? 0)` as a construct
  outside the set now use a store whose index holds an `if` (`store short-circuit operand`).
