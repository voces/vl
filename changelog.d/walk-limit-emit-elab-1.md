## Codegen, memory & runtime (Track B)

- Fourteen elaboration walks in `emit_elab.vl` (union arms, function-set reps, record returns, alias chains, forwarded parameters) visit each type or declaration once instead of stopping at a fixed depth.
