## Codegen, memory & runtime (Track B)

- **D16708 closed:** an un-annotated parameter bound at numbers of no one base (`5000000000 | i32`) takes the union box an annotation or a type parameter takes, so its reads, `print`, `==` and `+` build a valid module. The pin's widening (`monoPinWidenTy`) no longer turns such a union into its widest scalar. `3 | i64` at a hole, a loud emit refusal before, also runs. The `return` form of `coalesce-hole-call-litunion-join.matrix.vl` runs 66 of 66.
