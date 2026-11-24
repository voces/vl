## Codegen, memory & runtime (Track B)

- **IR: a union `==` against a `boolean | null` operand, over a union with no `null` arm, builds in the IR**: off the null leg the operand is its niche's i32, compared with `i32.eq` against the bool payload as legacy writes it, so a `null` never equals a bool. tests/cases `union compare operand rep`: 1 function → 0, and the distilled corpus's 10 → 0 (the D17065 `bool` cells).
