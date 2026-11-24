## Codegen, memory & runtime (Track B)

- **IR: a union `==` against a `boolean | null` operand, over a union with no `null` arm, builds in the IR**: off the null leg the operand is its niche's i32, compared with `i32.eq` against the bool payload as legacy writes it, so a `null` never equals a bool. tests/cases `union compare operand rep`: 1 function → 0; all six operand positions (a parameter on either side, a field with `==` and `!=`, a global, a local) now build.
