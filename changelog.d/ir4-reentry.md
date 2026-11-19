## Codegen, memory & runtime (Track B)

- **IR re-entry 1, the value hole retired:** a value boxed into a `T | null` box is written by one
  shared plan (`holeBoxPlanOf`), whose head and tail halves both the IR and legacy's box writer
  call around their own operand. Legacy's box ladder no longer runs inside an IR-lowered function,
  and the hole (`emitBoxAroundHole`) is deleted. No emitted byte moves.
