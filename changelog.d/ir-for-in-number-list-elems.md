## Codegen, memory & runtime (Track B)

- **IR coverage: a walk over a list of `f64` lists, `i64` lists or nullable byte lists, byte-identical to legacy.** `forInElemPlain` now admits the `f64list`, `i64list` and `nulu8list` element kinds, so the IR's list walk binds each inner list as it is stored, an empty or `null` one included. Only the IR builder reads it, through `forInPlainWhy`. `for in element f64list`, `i64list` and `nulu8list` fall to 0.
