## Type system (Track A)

- **Ruling 4.1 (as clarified):** `as f32` / `as f64` reads a radix literal as the value its digits
  spell, rounded, so `0xFFFFFFFF as f32` is 4294967296 where it was -1.0; a float destination or
  peer still takes only a value it holds exactly.
