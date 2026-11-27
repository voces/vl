## Codegen, memory & runtime (Track B)

- **IR: an else-less value `if` whose condition is a constant is built as written, its `else` the join's null**, at a scalar, reference and union join: `ref if static condition` and `expression if static condition` 6 → 0 units on their programs under `VL_IR_REQUIRE_CLAIM=1`.
