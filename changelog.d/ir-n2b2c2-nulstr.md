## Codegen, memory & runtime (Track B)

- **IR N2b-2c-2a, `string | null`:** the IR admits the nullable string rep. A `null` into it is
  legacy's typed null, and a string into it the same ref. Legacy's `??` niche arms are one shared
  decision (`coalNicheArmOf`), and the IR builds `s ?? "literal"` through legacy's own block.
  No emitted byte moves.
