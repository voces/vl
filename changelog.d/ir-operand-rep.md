## Codegen, memory & runtime (Track B)

- **IR coverage: a literal `is` test over a null-tagged box.** `x is N` over `N | null`, a numeric or string literal union whose `null` is one more tag of its box, reads the box's tag as over a plain box (`tagBoxRep`); the arm and each literal's test are legacy's own (`litIsArmOf`, `litMemberEqArmOf`, `unionLitIsPlanOf`).
