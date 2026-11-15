## Type system (Track A)

- **D16324 closed:** a record `is` whose tested type narrows a field to a union member, a nested record or a list element runs, through `is`, `match` and `as?`/`as!` and over a nullable or union operand: each narrowed field is tested at its own type. D16325 files the generic-operand residue.
