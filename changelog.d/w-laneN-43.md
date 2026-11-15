## Type system (Track A)

- **Ruling 4.3:** a numeric literal joined with a typed value adopts that value's type where it
  fits, in `if`/`match` arms, `??` and list elements: `if c { 5 } else { f }` and `[5, f]` with
  `f: f32` are `f32`, `[0.1, f]` is `f32[]`. Lane O's 64-cell join grid: 64 of 64.
