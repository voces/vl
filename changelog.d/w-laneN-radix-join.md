## Type system (Track A)

- **D16561 closed (clause 1):** a radix literal tail beside a typed `i32` arm of a value join (`(if c { 0xFFFFFFFF } else { v }) * k` with `k: i64`) was read at the 64-bit destination or peer; under ruling 4.3 the join is `i32`, so it is now the 32-bit pattern `-1`, as with the join bound first. Joins of literals alone, or with a 64-bit arm, keep D2617's destination width.
