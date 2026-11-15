## Type system (Track A)

- **D16490 closed (clause 1):** a literal `let` stored an `f32` and a float literal (`let t = 0; t = f; t = t - 0.1`, `t -= 0.1`, `t = 2.5`), or initialised by a float literal (`let t = 0.0; t = f`), was silently typed `f64`; the literal now adopts the typed `f32` store, as ruling 4.3 joins any literal beside a typed value, and stores of literals alone still give `f64`.
