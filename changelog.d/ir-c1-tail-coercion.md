## Codegen, memory & runtime (Track B)

- **IR coverage, `tail coercion`:** a returned value built at a nullable rep, where the result is that rep's non-null inner and legacy's plain return writes `ref.as_non_null` after it (`retNeedsNonNullRecover`), is now recovered at the result. This covers an expression tail, a tail `if` arm and an explicit `return`. A tail whose delivery already missed keeps its own miss instead of the `tail coercion` label.

  Corpus `tail coercion` goes from 6 functions to 0 (the `d3290` grid). Two tests/cases functions stay, as a different mechanism.
