# Stage, else spill: a binary operator's left operand below its right (lane COV-UNION, 2026-11-26)

Coordinator ruling: since #10329 bytes are not a gate, so stmtBetween's remedy is "stage on the
stack, else spill the lead to a local". COV-IS built the spill (`irBSpillLeads`, #10367) for the
`null` name test. This change wires it into the binary operators' staging (`stageLeftBelow`).

## The change

`stageLeftBelow` stages the left operand below a right operand's statement on the stack
(`irBStageLeads`), as before. Where no stack stage holds it, the left is spilled to a local of its
own and read back at its use, instead of the IR missing (`short-circuit right operand`, or
`staged lead`). The spill requires the right operand to hold a statement (`ifBelowLeadHas`).

## Tried and dropped

- **Spilling below a `??` written in place, or a receiver stage.** In
  `loops/value-arm-prelude-any-position.vl` and `unions/shared-field-opt-coalesce-in-each-position.vl`
  the build then succeeded, but the lowering failed with `operand above a valued if's value`: an
  in-place `??`'s value waits on the stack at the use, below which the spilled read still lands
  out of order. Both stay refused by name.
- **Spilling as `irBStageLeads`' own fallback.** COV-IS measured that it reds the push-receiver
  shadow row, whose caller relies on the decline. The spill lives in this consumer instead.

## Measured

Each arm runs from its own checkout: master `af1e95952` from a base worktree, and this tree. The
population is tests/cases plus regen-10's COV-UNION programs.
- Without the new sweep, exactly one row moves: `after` in
  `types/infer-null-hole-if-coalesce-in-each-position.vl` leaves `short-circuit right operand`
  (4 → 3). Claims mode takes it, and its output equals master's under `VL_IR_STRICT=1`.
- `ir-identity.sh --cases`: differ 0. Behaviour is the same on all 149 byte-different programs. The
  spill's local is a byte difference, not a gate.

Q58 sweep: `tests/cases/operators/left-operand-spilled-below-void-if-right-positions.vl`.
- Positions: the right operand runs a `null`-typed `if` for its effect before its `??` default.
  The left is a parameter, a local, a field and a traced call, under `+`, `==` and string
  concatenation.
- Master misses 3 functions with `short-circuit right operand`. Here they build, and their only
  mismatch is bytes (the spill's local).
- The field, concatenation and traced-call positions are blocked on both seeds by other classes
  (`coalesce nulnone effect if`, `box of an effect's immediate`).
- The `@log` lines match under `VL_IR_STRICT=1` and on master's seed. The traced call runs once,
  first.
