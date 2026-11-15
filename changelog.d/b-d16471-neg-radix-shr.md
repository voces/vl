## Type system (Track A)

- **D16471 closed:** `>>` over a negated radix literal whose digits exceed `0x80000000` shifts the pattern at its use's width: `const a: i32 = (-0xFFFFFFFF) >> 3` is `0` (it printed `-536870912`), and at an `i64` use it stays `-536870912`.
