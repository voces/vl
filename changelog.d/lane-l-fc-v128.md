## Codegen, memory & runtime (Track B)

- **A vector in a record field** (`type Body = { p: F32x4, m: i32 }`) now compiles: the field is a `v128` struct slot, so a write is one store with no allocation. This closes D1981's struct-field face and D16481. On the AE-004 witness at -O3, versus the boxed `F32x4 | null` spelling that was the only option before: 4.8× less user CPU (0.233 s → 0.049 s), 390 B → 185 B, and 265 MB → 13 MB peak RSS. Arrays and maps of vectors still refuse. Record `==` over a vector field is refused at check as not value-comparable.
