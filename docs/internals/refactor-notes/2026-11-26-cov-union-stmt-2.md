# Staging a binary operator's left operand below its right (lane COV-UNION, 2026-11-26)

## The refusal

`u == (if p() { 1 } else { "t" })`, where `u` is a parameter or local (D2823,
`union-eq-non-binding-both-operands`, the `union-eq-both-operands-non-binding` probe). The right
operand writes a statement (a valued `if`). The left operand, a variable, is written at its use,
which would put it after that statement. The arithmetic operators stage the left operand below
the statement (`irBStageLeads`). The union compare, list compare, list concat and `boolean | null`
compare (`nicheBoolEq`) refused instead (`short-circuit right operand`).

## The change

- `stageLeftBelow` (`ir_build`): the arithmetic operators' rule, lifted into one helper. Where
  the right operand holds a statement the left one is staged below (a valued `if`, a `??` box that
  stages the leads before it, a store, an order stash, a tag dispatch's stash), it stages the left
  operand with `irBStageLeads`. Where the right operand holds one nothing is staged below (a `??`
  written in place, a receiver stage), it misses as before. Both tests read the statement classes
  of #10291 (`stmtClassOf`).
- The arithmetic operators, `unionEq`, `listEq`, `listCat` and `nicheBoolEq` call it.

## Measured

Regen-9's COV-UNION programs plus the sweep, the merge base before and this tree after:
- `short-circuit right operand` rows: 8 → 4. The four left hold a statement the helper does not
  stage below (a `??` in place, a void `if`).
- Distinct functions claimed: 375 → 376 of 424. Start bodies: 30 → 31 of 51. Programs fully
  claimed: 2 → 4.
- Outputs equal master's (default and `VL_IR_STRICT=1`) on D2823, both union-eq programs,
  `value-arm-prelude-any-position` and `shared-field-opt-coalesce-in-each-position`.

Q58 sweep: `tests/cases/operators/left-operand-staged-below-valued-if-right-in-each-position.vl`
(a parameter, a local and a literal on the left of each operator, printed and bound). Its output
equals master's. Master reports `short-circuit right operand` on it; this tree reports blockers
none, and the claim takes it.

## The atom compare (D17244)

`"a" == (s ?? "b")` and `t == (s ?? "b")` over a `K | null` fell back in the lowering (`operand
above a valued if's value`). The `??`'s join is a valued `if`, and legacy writes the left side
first.
- The `ids` arm (two atom values) calls `stageLeftBelow`, as the other operators do.
- The `static` arm with the literal on the left stages the literal's member id when the atom side
  holds a statement that leads below (`stagedStaticId`). It records `aeStatic` 4, a staged id that
  the lowering reads like any operand. The literal must spell the plan's member (`aqLex`). An
  `OStr` at an atom rep now lowers as its member's id (`strOpnd`). Every earlier atom `OStr` was
  minted only where `strLitTakesAtom` holds, so their bytes are unchanged.
- Measured: both witnesses and the sweep
  `tests/cases/literal-unions/atom-compare-left-staged-below-coalesce-right-positions.vl` fall
  back in 4 functions on the merge base (lit, litNe, param, start). This tree claims them, they
  match under `VL_IR_SHADOW=6`, and they are byte-identical to the claimless build. The tests/cases
  census (9,621 programs) is unchanged row for row. `ir-identity.sh --cases`: differ 0.
