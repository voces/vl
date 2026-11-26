# IR: a box with a record arm wider than the destination's, retagged (cov-is-53)

Lane COV-IS, 2026-11-26. Regen-10 row `box ladder` on the D15057 witness (the record-wider `D | B`
retag; the `Pet | null` form closed in cov-is-46).

## Change

- `holePassPlanOf` (`compiler/emit_plan_union.vl`) returned `ladder` for a box whose arms include a
  record wider than an arm of the destination union (`wideRetagPairsOfTy` non-empty). It now
  returns the new arm `wideRetag`, carrying the destination union.
- `wideRetag` writes no head, the box as its value, and `mapBoxTail` as its tail: the retag chain
  (`emitWideRetagChain`) then the members' retag where the box owes one. That is what legacy's
  ladder wrote through `emitUnionCoerce` → `emitUnionWideRetag` and `emitUnionBoxArg`'s
  `boxRetagTail`, so legacy now writes it through the plan too.
- The builder takes a box operand for it (`boxPlanWhy`); the lowering reads the operand as a box
  plan with no leading head (`boxOp`).

## Measurements

- D15057's witness: claimed whole under `VL_IR_REQUIRE_CLAIM=1`, strict, prints `5`.
- Sweep `tests/cases/unions/wider-record-arm-box-retagged-into-union-positions.vl`: declaration,
  argument, return, assignment, record field, list element, map value; graded by `@log`.
