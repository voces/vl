## Codegen, memory & runtime (Track B)

- **IR decision modules 4, a value `if`'s join:** `emitIfExpr` dispatches on one shared plan,
  `ifJoinPlanOf` in the new `emit_plan_if_join.vl` (an all-null, atom, union box, reference or
  scalar join), and the IR's plain-`if` test asks that plan instead of restating the ladder; the
  armed `ifExprPlainKind` agreement check it needed is gone. No emitted byte moves.
