## Type system (Track A)

- **D16325 closed:** a record `is` that narrows a field to a type rather than a literal set (`a is B` with `B = { x: i32 }` over `A = { x: i32 | string }`) runs when its operand is a type parameter or an un-annotated parameter. Emit used to refuse it with "has no lowering yet".
- **D16847 closed:** the same test over an un-annotated parameter handed `A | null` answers `false` for null; it used to trap.
