# IR: an immediate standing for an effectful node is staged before its box (cov-is-57)

Lane COV-IS, 2026-11-26. Regen-11 class `box of an effect's immediate` (3 units: `cat`,
`argUnion`, `interp`).

## Change

- A `??` whose left is a `null`-typed `if` run for its effect (`nulNoneEffect`) folds its value to
  the default's immediate, which still stood for the `??` node. `boxTempIn`
  (`compiler/ir_build.vl`) refused to box it ("box of an effect's immediate"), and verifier rule 2
  (`ir_verify.vl`, `RToBox`, `bxFree`) refuses a box whose immediate stands for a node with an
  effect.
- The builder now stages such an immediate (`RStage` at its own rep, which rule 2 of `RStage`
  allows for a literal) before the plan is asked, so the box's operand has no tie to the node and
  rule 2 holds unchanged. A plan that writes its literal from the node (`lit`, `null`) takes only an
  immediate and so declines a staged one (`boxPlanWhy`); every other arm reads its operand.
- An assignment's immediate keeps its own path (the box of an assignment, past its span).

## Measurements

- The 3 units are claimed; `types/infer-null-hole-if-coalesce-in-each-position.vl` is claimed
  whole under `VL_IR_REQUIRE_CLAIM=1`; both files' `@log` lines hold under `VL_IR_STRICT=1`. Their
  bytes differ from legacy only in the locals prefix (the staged slot).
- Sweep `tests/cases/null/null-if-coalesce-default-boxed-positions.vl`: union argument (string and
  number default), interpolation hole, union binding, return, record field and list element, each
  arm's effect logged; master misses all 7 at `box of an effect's immediate`, this branch none; output
  equals the `VL_IR=0` run.
