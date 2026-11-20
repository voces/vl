## Codegen, memory & runtime (Track B)

- **IR: one closure-call argument decision.** `callRefArgArmOf` names the arm a function-value
  call writes each argument by, and legacy's `emitCallRefArg` dispatches on it; the IR's plain
  closure call asks the same arm. A call through a record's function field (`o.f(x)`) now builds
  through the IR as a closure call. No emitted byte moves.
