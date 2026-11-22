## Codegen, memory & runtime (Track B)

- **IR: a captured call of a nested generic instanced at two types:** such a call now builds in the IR. Its closure is the instance's own parameter and result reps, interned with no type (`repClosureOfReps`). The verifier holds a variable typed -1 at such a closure (`irUntypedClosure`). Byte-identical; `tests/cases`'s `captured call closure rep` count falls from 56 to 0.
