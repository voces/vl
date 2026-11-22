## Codegen, memory & runtime (Track B)

- **IR coverage: a `(K | null)[]` or `(boolean | null)[]` element read the checker narrowed past its null.** The element is the i32 its niche holds, which legacy's scalar-list read writes alike at either type (distilled corpus `index element coercion` 16 → 1).
