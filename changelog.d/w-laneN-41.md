## Type system (Track A)

- **Ruling 4.1:** in a float context (an `f32`/`f64` destination, a float peer, `as f32`/`as f64`)
  a radix literal is the value its digits spell, rounded: `0xFFFFFFFF as f32` is 4294967296 and
  `const b: f32 = 0x7FFFFFFF` is admitted. Lane O's 182-cell grid: 182 of 182.
