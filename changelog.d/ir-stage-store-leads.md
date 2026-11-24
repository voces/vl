## Codegen, memory & runtime (Track B)

- **IR: an earlier operand is staged below a store that a later operand makes**: in `two(b, b = 2)`, `two(g, g = 2)`, `two(o.f, o.f = 2)` and `two(xs[0], xs[0] = 2)`, the earlier read reaches the stack before the store, as legacy writes it. Before, the IR builder declined these (`store after an operand`, `assignment value lit after an operand`). The lowering now stages pending temps below a local, global, field or element store, as it already does below a valued `if`.
