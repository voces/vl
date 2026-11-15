## Type system (Track A)

- **D2774 closed** (ruling 4.3): an un-annotated function's returns are a join too, so
  `if c { return 5 } return fv` with `fv: f32` infers `f32`, as a return-tail `if`/`match` does.
