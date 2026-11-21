## Codegen, memory & runtime (Track B)

- **IR coverage: an operator's left variable or literal is staged below a valued right `if`.** `x + (if k { 1 } else { 2 })` missed as `short-circuit right operand` when `x` was a variable or an immediate, which the lowering writes at its reader rather than below the `if`. The binary operator now stages such a lead as #9289's argument staging does (`irBStageLeads`), except over a tag dispatch's stash, which stays `tag dispatch after an operand` (self-compile +5 functions with no blocker).
