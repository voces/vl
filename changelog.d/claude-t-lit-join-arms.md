## Codegen, memory & runtime (Track B)

- **D16498 closed:** a radix literal tree that is one arm of a value join computes at the join's type. The other arm decides that type, for example a decimal outside `i32` (`if c { 0xFFFFFFFF % 7 } else { 3000000000 }` is `3`). This holds under every operator, including `+`, where `0xFFFFFFFF + 1` used to print `0`, and at an `f64` join. Before, the tree was computed at 32 bits.
- **D16497 closed:** float arithmetic over a value join of literals, or a negated join, now computes at `f32` in three places, as the join alone does:
  - beside a typed `f32`;
  - as a `min`/`max` operand beside one;
  - delivered into an `f32`.

  Before, the first two computed at `f64`, and the `f32` destination refused the program. A bare join is now a `min`/`max` operand that adapts to `f32`, as it already was beside a binary operator.
- The oracle gives `match` the same literal-join rule as `if`. It reads a radix tree in a float join at 64 bits, and it now folds a float tree over a join beside an `f32` instead of reporting a spec gap.
