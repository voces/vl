## Codegen, memory & runtime (Track B)

- **IR claims an `is` test of a record field held as a nullable over a union box, and the field's narrowed read after it** (`o.v is string` then `o.v + "!"` over `{ v: string | i32 | null }`, a closure union's `{ f: F | null | string }`), at a parameter's, a global's, a nested field and a loop element.
