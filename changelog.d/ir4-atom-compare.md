## Codegen, memory & runtime (Track B)

- **IR coverage: an atom operand of a string op.** A literal-union atom in a string `+`, or in
  `==`/`!=` against a plain string, is now built by the IR. It decodes the atom to its member
  string, as legacy's `emitStrValue` does. Self-compile covered goes 18,618 → 18,659 and the
  corpus 94,601 → 94,654, with every function matched; `atom compare` misses go 44 → 0. No
  emitted byte moves.
