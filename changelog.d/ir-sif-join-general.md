## Codegen, memory & runtime (Track B)

- **IR: an `if`'s decided reference join is a value.** The IR's `if` node carries the reference
  join it opens at (kind and slot) and whether that is nullable, set where the builder decides it,
  so the lowering asks nothing. A reference join's chain sets it from its head; other builders
  can set it with no chain head. Generated code is unchanged.
