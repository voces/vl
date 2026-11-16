## Infrastructure (Track F)

- **The hof fuzz generator names `compose`'s type arguments when it calls `compose` at `i64` or `f64`.** Since D16562, `A` binds at `i32` when nothing binds it. On seeds 1-60, the hof refusal share falls from 13% to 4%, under its 7% ceiling.
