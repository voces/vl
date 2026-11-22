# IR: a `??` written in place after an earlier operand, 2026-11-22

Lane IR-N4, the self-compile tail. A `??` the IR writes in place (`SCoalBox`, its out left on
the stack for its one read) refused any operand built before it. `irBStageLeads` refused it as
an argument after another (`short-circuit argument after another`, via `inPlaceFrom`), and the
six coalesce builders refused a pending temp ahead of it (`coalesce <arm> after an operand`).
Legacy writes the earlier operand first, then the `??`, its value staying on the stack.

## Change

- `coalBox` (ir_lower) stages the temps an earlier operand left pending below its operand with
  the valued `if`'s own `stageLead`, under the same floor push and pop. A fused map read
  (`cbMap`) also reads its key, which `stageLead` does not count as its condition, so it stages
  none and keeps the old order.
- `irBStageLeads` stages earlier arguments below an `SCoalBox` as it does below a valued `if`:
  `coalBoxFrom` and `coalBoxOut`, siblings of `valuedIfFrom` and `valuedIfOut`. Its in-place
  refusal keeps only the receiver stage, `receiverStageFrom`, split out of `inPlaceFrom`;
  `inPlaceFrom`'s other four callers are unchanged.
- The six `coalesce … after an operand` refusals are dropped.

New predicates (R8): `coalBoxFrom`, `coalBoxOut` and `receiverStageFrom` read only the IR's own
nodes; none restates a legacy condition.

The first cut widened `valuedIfFrom`/`valuedIfOut` themselves and dropped `SCoalBox` from
`inPlaceFrom`. Narrowing to `irBStageLeads` alone still left 12 self functions as
`unlowered: stack value read out of order`; the map probe's key was the cause, and the `cbMap`
exclusion took them to 0.

The shadow row is `tests/ir-shadow-rows/coalesce-after-operand.vl`.
