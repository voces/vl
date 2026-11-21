## Codegen, memory & runtime (Track B)

- **IR coverage: an assignment valued as its number literal.** `return g = -1`, `(n = 5) + k`: legacy stores, then writes the right side's literal again at the reading position's width (`asgValueArmOf` "lit", `emitAsgLitAs`), and a delivery wider than the assignment's own type does the same at its width (`widenPlanOf`'s `asgLit`). The builder now does both, the literal one immediate with its minus signs folded as the lowering folds a `neg`.
