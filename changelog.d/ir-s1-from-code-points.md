## Codegen, memory & runtime (Track B)

- **IR S1, `fromCodePoint` and `fromCodePoints`:** legacy's two encoder writers split after
  their operands, and the IR builds a string from one code point or from a local code-point
  list through the same tails. A list legacy spills to a scratch slot stays a named miss. The
  corpus hands 2,360 more functions to the IR. No emitted byte moves.
