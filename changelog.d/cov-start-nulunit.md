## Codegen, memory & runtime (Track B)

- **IR `null[]` fill and push, and a `null` local read at the unit:** `__array_new__`'s fill and a `.push` onto a `null[]` are its i32 storage's sentinel, as an element store and a list literal already were (the verifier takes it at those two sites too). A `null`-unit local read where the unit itself is asked is the bottom ref, as legacy writes it. Claims `put` and `filled` at `T = null` (`null-unit-heap-positions.vl`) and D14773's `put`; `insert`'s element copy (`self[i] = self[i - 1]`) still misses.
