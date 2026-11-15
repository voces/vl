## Codegen, memory & runtime (Track B)

- **D16183 closed:** `return v = e` into a captured binding of a wider type (`K | null` written with `"ww"`, an `i64 | null` cell with `7`), and a returned `if` whose arm writes a field, yield the write's right side, as their tail spellings already did.
