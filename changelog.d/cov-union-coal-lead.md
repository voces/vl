## Codegen, memory & runtime (Track B)

- **IR builds a `??` written in place as a binary operator's right operand after a lead read at its use (lane COV-UNION):** in `1 + (g.j?.a ?? 5)`, `n - (v.j?.a ?? 5)` and `acc + (m["k"] ?? if ... )`, the left operand (an immediate, a parameter, a global, a local) is staged as a temp below the box head, as legacy writes it first. Before, the IR refused (`short-circuit right operand`).
