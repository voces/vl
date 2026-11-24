## Codegen, memory & runtime (Track B)

- **Fix:** comparing a record with a value `if` whose arm is a union narrowed to that record (`v == (if u is P { u } else { v })`) compiled to invalid wasm; it now compares the two records field by field.
