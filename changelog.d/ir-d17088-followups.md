## Codegen, memory & runtime (Track B)

- **IR: a compare of two `null`-typed sides builds in the IR** (`null test of null`, 19 functions and 13 start bodies on master's census; `operand at null` for two non-literal sides): each side runs for its effect, left then right, where the answer is read, then the constant, as legacy's `emitNulNoneEq` writes it.
