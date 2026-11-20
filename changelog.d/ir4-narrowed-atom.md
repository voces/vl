## Codegen, memory & runtime (Track B)

- **IR coverage: an atom cell read at a string.** This covers a D1752 binding, or a literal
  union narrowed to one member. The read takes its cell's rep where a delivery builds it, and the
  delivery decodes it or passes the id, as legacy's position does. A `let` that legacy holds as
  the atom now needs an atom rep in the IR, which closes a latent invalid-wasm gap. Self-compile
  covered goes 18,831 → 18,841. No emitted byte moves.
