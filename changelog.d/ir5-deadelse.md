## Codegen, memory & runtime (Track B)

- **IR: a statement `if`'s dead arm is written as legacy writes it.** An `else` the checker proved dead is not built (`ifWritesElse`), and a dead `then` is `unreachable` (`isDeadArm`), so a narrowing chain with a dead arm matches legacy's bytes instead of writing the arm (D16006).
