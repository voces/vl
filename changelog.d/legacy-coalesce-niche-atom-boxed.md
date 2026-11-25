## Codegen, memory & runtime (Track B)

- **D17182 closed: a `??` over a literal union's `K | null` that a call returns, with a number or boolean default, now runs**: `print(g() ?? 2)`, `g() ?? false`, `const r: K | i32 = g() ?? 0`, and chains of calls. The call is evaluated once. Before, it was the emit refusal "`??` over this nullable value is not supported yet"; a bound operand or a field already ran.
