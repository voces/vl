## Codegen, memory & runtime (Track B)

- **IR blocker census:** `$VL_IR_SHADOW=4` builds each function past its missed statements, and
  `ir-shadow.vl -- --blockers` reports which miss classes, alone or in pairs, keep functions
  uncovered. Coverage steps are now chosen and graded by the functions they unblock. The builder's
  catch-all miss names its node kind. No emitted byte moves.
