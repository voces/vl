## Codegen, memory & runtime (Track B)

- **D4018 closed:** `v as? F` to the function arm of a union (`F | string`, `F | i32`, two function arms) runs: the closure when the box holds that arm, `null` otherwise, bound, returned, stored in a field or a list. On master it refused at emit.
