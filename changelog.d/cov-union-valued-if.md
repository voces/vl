## Codegen, memory & runtime (Track B)

- **IR builds a string `??` over an operand holding a valued `if` or a `??`, and a void `if` after a waiting operand (lane COV-UNION):** `id(if c { s } else { null }) ?? "none"`, an arm-site narrowed receiver's `m.get("k") ?? "none"`, and a `??` nested in the operand go by the IR, which holds that operand in a local of its own. A `null`-typed `if` run for its effect inside a `??` after an earlier operand (`r.n + ((if c { x } else { x }) ?? 11)`) is written as the statement it is, the waiting operand staged below it.
