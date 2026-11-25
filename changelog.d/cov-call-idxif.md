## Codegen, memory & runtime (Track B)

- **IR claims a list read whose index is a valued `if`:** legacy writes the receiver ahead of the index's `if`; the builder refused it (`index valued-if operand`) and now stages the receiver below the `if` (`irBStageLeads`), the staged receiver opening the read's row as legacy's does. `index valued-if operand` falls from 7 rows to 0, byte-identical.
