## Type system (Track A)

- **Ruling 4.1 wording:** an integer literal, radix or decimal, that a float destination,
  argument or peer does not hold exactly is refused as `constant 4294967295 is not exact at f32`,
  the sentence a constant tree already had, where it read `i32 doesn't fit in f32 — lossy…` or
  `operator '+' mixes f32 and i32`.
