## Codegen, memory & runtime (Track B)

- **IR coverage:** a `??` whose left operand a generic instance closed to a type with no `null` (`orD<T>(x: T, d: T) { return x ?? d }` at `i32`) is built by the IR as the left operand alone, as legacy writes it (corpus: 75 more functions covered; self-compile: 2).
