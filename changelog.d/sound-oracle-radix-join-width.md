## Infrastructure (Track F)

- **Three oracle gaps from a 60-seed fuzz are fixed, with smoke pins.** All three were oracle-side; the compiled output was right in each.
  - 4.3: a radix tree that is not constant, beside a typed integer arm, runs at that arm's width.
  - D3043: a radix tree holding a decimal outside i32 is i64-wide beside an i32 arm.
  - A float join beside a typed `f32` argument of `min`, `max` or `abs` adopts f32.

  The hof generator's refusal share rose from 5% to 13% at d7b8845e7 (D16562), because `compose`'s unbound `A` now takes `i32`. Most of the rest is D16813, filed: a `let` reassigned between two hole functions pins both at the first call's type.
