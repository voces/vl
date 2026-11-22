## Codegen, memory & runtime (Track B)

- **IR coverage: a `??` after an earlier operand.** A call argument or operand written as a
  `??` after another one (`f(27, k ?? "i32")`, `f(g(n), k ?? d)`) builds through the IR: the
  earlier operand is staged below the `??`, as legacy writes it first. No emitted byte moves.
