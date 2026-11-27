## Codegen, memory & runtime (Track B)

- **IR builds a call to a nested function whose argument holds a valued `if` or a `??` (lane COV-UNION):** the call writes its hidden environment and captures ahead of the arguments, so such an argument is held in a local and every earlier one spilled; before, the call could not be lowered.
