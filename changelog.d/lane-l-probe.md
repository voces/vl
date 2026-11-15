## Type system (Track A)

- **D4082 closed:** a record `is` whose tested type narrows a field to a union member, a nullable's inner type, a contained record or a list element runs, through `is`, `match` and `as?`/`as!` and over a nullable or union operand: each narrowed field is tested at its own type. D16325 (a generic operand), D16326 (`x is 1 | "a"` over `i32 | string` answers for one base, clause 1) and D16327 filed.
