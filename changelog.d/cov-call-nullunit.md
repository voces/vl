## Codegen, memory & runtime (Track B)

- **IR:** a `null[]` literal's element at the `null` rep (a generic's `T | null` at `T = never`) is the list's null sentinel, with its effect kept (`convert null -> i32`: D17447 and its case).
