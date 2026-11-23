## Codegen, memory & runtime (Track B)

- **IR coverage: a literal-union member narrowed out of a union box prints as the string it is boxed as.** `if x is K0 { print(x) }` over `x: K0 | f64` (a local, a union-box field or a box global) unboxes the stored string. The IR now types that read at `string` (`irBUnboxKindRep`), not at `K0`'s atom rep. `print operand rep str got atom` falls from 50 functions and 2 start bodies to 0, and legacy's output is byte-identical.
