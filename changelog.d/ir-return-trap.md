## Codegen, memory & runtime (Track B)

- **IR coverage: a returned `__trap__()`.** `function unset(): T { return __trap__() }`, an unset hook's default, failed the builder at `rep novalue`. Legacy writes the trap, then a `return` that the trap leaves dead. The builder now writes the same trap and a bare `return`, and the verifier accepts a bare return directly after a trap at any result. At an `i64`, `f64` or `f32` result legacy also widens the dead value, so that case stays a named miss (`returned trap widened`).
