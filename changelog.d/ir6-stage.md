## Codegen, memory & runtime (Track B)

- **IR coverage: an earlier operand staged below a valued `if`.** When a valued `if` (a `&&`,
  `||` or value `if`) follows an operand whose value is still to be written, the lowering now
  writes that operand first, in legacy's order, and keeps it on the stack beneath the `if`; a
  variable or constant argument before such an `if` becomes a staged temp (`RStage`) where it was
  read. The self-compile's `if after an operand` and `short-circuit argument after another` misses
  close. No emitted byte moves.
