## Codegen, memory & runtime (Track B)

- **IR coverage, `__array_new__`:** an `__array_new__(n, fill)` call builds through the IR as a
  list allocation over its length and its fill, written by the stash and tail legacy also writes,
  on legacy's own plan (`arrNewPlanOf`) and routing (`arrNewCallNamed`). 18 more corpus functions
  and 24 more self-compile functions have no IR blocker. No emitted byte moves.
