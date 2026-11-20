## Codegen, memory & runtime (Track B)

- **IR coverage: a join of member literals into an atom.** An `if` whose arms are member
  literals, delivered to a literal-union destination by the atom hook's third arm, is now built
  by the IR at the destination's atom rep, each literal its id, as legacy's `emitIfExprAs` writes
  it. `hookTakesAtom` splits into a pure part, which the builder asks, and the raw-read check,
  which the lowering re-asks. Self-compile covered goes 19,022 → 19,028. No emitted byte moves.
