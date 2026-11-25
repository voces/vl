## Codegen, memory & runtime (Track B)

- **IR claims a direct call with named arguments:** `f(b: 1, a: 2)`, a positional argument after a named one, a defaulted parameter left out, a UFCS receiver and a generic callee, at module scope and in a function the checker does not reorder. The IR binds them through legacy's own `orderedDirectArgs`, so the operands land in parameter order as `emitDirectCall` writes them; a named call anywhere else stays a miss. `named call` falls from 7 rows to 0. Legacy's bytes are identical across every population and the self-compile.
