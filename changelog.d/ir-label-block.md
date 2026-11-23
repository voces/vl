## Codegen, memory & runtime (Track B)

- **IR coverage: a void labelled block is one block frame a `break` leaves (`emitLabelBlock`); a `continue` inside it reaches the loop around it.** tests/cases `labelled block` 73 → 0 over its 28 programs: 18 more functions build whole, and the 50 that carry a value now name it (`loop value`).
