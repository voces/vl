## Codegen, memory & runtime (Track B)

- **IR coverage: an assignment used as a value, re-read from a wider cell.** Examples are `return x = if c { 5 } else { 1 }` into an `i64 | null` cell and `return held = { v: v }` into a nullable record global. The IR now re-reads the cell and narrows it back by the one opcode legacy writes: `i32.wrap_i64`, `i32.trunc_f64_s` or `ref.as_non_null`. Legacy's bytes don't change.
