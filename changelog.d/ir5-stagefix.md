## Codegen, memory & runtime (Track B)

- **IR: a staged literal at a literal-union parameter is held at the parameter's type.** #9289 let a string literal lead stage below a valued `if`; one built as an atom's id (`test("lt", cp, i32(if … else if …))`, a `PrimOp` parameter) was a temp at the atom's rep but its node's string type, which the verifier refuses (rule 3). `stageTyOf` holds it at its delivery type, or misses by name.
