## Codegen, memory & runtime (Track B)

- **IR spills a binary operator's left operand where no stack stage holds it below its right operand (lane COV-UNION, coordinator ruling "stage, else spill"):** `k + ((if c { x } else { x }) ?? 11)`, whose right operand runs a `null`-typed `if` for its effect, now sets `k` into a local of its own (`irBSpillLeads`, #10367) and reads it back. Before, the IR refused (`short-circuit right operand`). A `??` written in place and a receiver stage still refuse: their value waits on the stack at the use, below which a spilled read lands out of order.
