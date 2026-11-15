## Type system (Track A)

- **D16540 closed:** a constant tree argument at a generic's bare type parameter adapts to the
  call's destination as a lone literal does (D3539): `const y: f32 = g(0.1 + 0.2)` prints
  `0.30000001192092896`, folded in `f32` arithmetic. The oracle binds a type parameter from the
  destination for such arguments too.
