## Codegen, memory & runtime (Track B)

- **IR coverage: a bitwise not builds as legacy's xor with the all-ones mask.** `~x` was the builder's `unary ~` miss; it is now a `xor` of the operand and a `-1` immediate at the operand's rep, the bytes legacy's `emitUnaryNode` writes (self-compile +6 functions with no blocker).
