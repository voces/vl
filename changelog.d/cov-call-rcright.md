## Codegen, memory & runtime (Track B)

- **IR claims a record compare whose right operand is a valued `if`:** legacy stashes both operands, the left first, so the right's `if` opens above the left. The builder refused any such `if` above the left (`record compare right operand`); it now stages the left below it (`irBStageLeads`), as an operand list stages its leads. `record compare right operand` falls from 7 rows to 0, byte-identical.
