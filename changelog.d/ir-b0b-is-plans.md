## Codegen, memory & runtime (Track B)

- **IR B0b, the `is` test's literal, tag and numeric rungs as plans:** each rung's decision is
  one plan its writer reads, so the decision `isArmOf` makes is no longer summarised beside the
  writers. No emitted byte moves.
