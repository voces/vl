## Codegen, memory & runtime (Track B)

- Step 7 L6: the inline union registrar decides whether a union is a value union from its type alone. A union of literals counts each literal at its base (`litBaseTy`), as its spelling did, so `9000000000 | 1` and `(1 | 2) | null` stay value unions without reading `i64|i32` or `i32|null`.
