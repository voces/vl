## Codegen, memory & runtime (Track B)

- IR: a value `if` joined at an atom (a literal union, or one nullable at the `-1` niche) builds on
  the plain scalar path and lowers as an `i32` `if`, as legacy's `emitIfExprAs` writes it.
