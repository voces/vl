## Codegen, memory & runtime (Track B)

- **IR coverage: a nullable literal-union compared with a string.** A `==`/`!=` between a
  `K | null` literal union and a string builds through the IR on legacy's null-guarded route,
  with the atom decoded to its string as legacy writes it. No emitted byte moves.
