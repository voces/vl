## Codegen, memory & runtime (Track B)

- **IR: an earlier string operand, a literal included, staged below a valued `if`.** `"a=" + (if c { x } else { y })`, and the same as an accumulator append, lower through the IR: both string-operand loops stage their earlier operands with `irBStageLeads` (the call arguments' staging, now shared), and a string literal stages at its own string rep (`RStage`'s verifier keeps the box-view escape for a variable).
