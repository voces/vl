## Codegen, memory & runtime (Track B)

- **D16046:** `i8[]`, `u16[]` and `i16[]` can be union arms, beside `u8[]`, records, scalars and
  each other. Each width gets a box tag of its own, so `is`, narrowing, `==`, `as!` and `??` work
  at every packed width. Programs without such an arm compile to the same bytes as before.
