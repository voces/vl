## Codegen, memory & runtime (Track B)

- **IR claims an assignment of `null` used as a value into a boxed `T | null`** (`const u: i32 | null = (s = null)`): the store, then the box's null.
