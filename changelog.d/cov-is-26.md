## Codegen, memory & runtime (Track B)

- **IR claims a compare whose left side assigns `null`** (`(n = null) == z` with `z` a nullable name), the store written ahead of the null test as legacy writes it.
