## Codegen, memory & runtime (Track B)

- **IR verifier: rule 5's end-of-body check reads the end pad the builder records, not legacy's `fnFallThroughPadOf`** (D17049, the second edge retired). `IrFn.irEndPad` is set when the builder starts a function. The verifier and the IR lowering's end padding both read it, so neither imports the legacy query.
