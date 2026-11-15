## Type system (Track A)

- **D16047 refinement, the rest:** an empty list in a union arm of another tag never fits `is` of a list type, even where their elements could share a value (`(i32 | string)[]`, `(i32 | null)[]`, a record list tested at a contained record's list); the D4949 store-back that served the old answer is deleted.
