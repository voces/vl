## Codegen, memory & runtime (Track B)

- **IR claims an integer negation of a valued `if`:** `-(if c { a } else { b })` at `i32` or `i64` is `0 - x`, with the zero staged below the `if`, as legacy writes it. `integer negation of a valued if` falls 2 → 0: `numerics/negated-join-adopts-typed-peer.vl` and D16671's witness are fully claimed. Claimed and claims-off builds are byte-identical.
