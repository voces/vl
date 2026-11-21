## Codegen, memory & runtime (Track B)

- IR coverage: an `as`, `as?` or `as!` out of a union box is built by the IR (`RAsUnion`, lowered through legacy's tag test and tail), and a `T | null` niche's `as?` and `as!` (the operand, `RCast`'s `ref.as_non_null`); the other union-cast lowerings are named misses.
