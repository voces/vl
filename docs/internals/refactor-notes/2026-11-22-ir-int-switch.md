# IR: a dense integer `match` as one `br_table`, 2026-11-22

Lane IR-N4, the control-flow tail. Legacy writes an integer `match` chain whose arms test one
plain integer place densely as a single `br_table` (`emitIntSwitch`). The IR refused every such
chain: `tail if switch` from `tailIf`, `if switch` from `ifChain`.

## Change

- `intSwitchPlanOf` (wasmEmit) is `emitIntSwitch`'s planning, factored out unchanged: the
  scrutinee, its width, the low value, the table and the arms, or null where the chain stays a
  chain. `emitIntSwitch` now reads that plan; its bytes are unchanged. The IR calls the same
  function, so no predicate is restated.
- `SIntSwitch` (ir.vl) is the node: the scrutinee operand, its width and low value, the table,
  the arm bodies and the else body, and whether the arms are a tail chain's. The verifier checks
  (rule 7) that the scrutinee is a 32-bit integer, or a 64-bit one when wide, and that every
  table entry names an arm or the else.
- The builder builds one in `tailIf` (mode 1, arms by `tailArm`) and in `ifChain` (mode 0, arms
  as statement lists), where the plan is not null. In a statement chain, a switch link takes the
  rest of the chain and is the previous link's else. The scrutinee must be the place's own
  variable, since legacy reads it twice when 64-bit.
- The lowering writes `emitIntSwitch`'s frames, index arithmetic, `br_table` and arm branches,
  pushing a frame for each so a `break` inside an arm resolves.
- `tailIfPlainWhy` now answers one-number before switch, the order `emitIfTail` takes.

The value modes (`emitIntSwitch` modes 2 and 3, a valued `if` expression) are not covered here.

The shadow row is `tests/ir-shadow-rows/int-match-br-table.vl`.
