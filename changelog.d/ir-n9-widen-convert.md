## Codegen, memory & runtime (Track B)

- **IR coverage: a numeric union delivered into a wider number converts at the member it holds.** A box at an `f64`, `i64` or `f32` destination (a global, a declaration, an argument, a return or a tail) is built as legacy's `emitNumUnionConvert` writes it, through `widenPlanOf`'s `convert` arm and a new `RNumUnionConvert` node (tests/cases +21 functions covered, +5 start).
