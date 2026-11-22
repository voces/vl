## Codegen, memory & runtime (Track B)

- **IR coverage, a literal place narrowed out of a mixed box into an atom destination:** legacy's
  atom tower (each member's id, then the place's string read tested against each member) builds
  through the IR, by the tails legacy writes it with. No emitted byte moves.
