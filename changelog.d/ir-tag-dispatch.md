## Codegen, memory & runtime (Track B)

- **IR coverage, tag dispatch after an operand:** a call through a tagged function set that follows
  another operand (`x * 2 + g(1, 2)`, `g(1, 2) + g("a", "b").length`) builds through the IR. The
  earlier operand reaches the stack before the callee's id stash, as legacy writes it. No emitted
  byte moves.
