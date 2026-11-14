# D16038: a record union `==` beside its own `| null` twin, 2026-11-14

Lane G. `emitUnionUnionEq` routes a struct-union pair to `emitStructUnionEq` only when both
operands name one union, first by name and then by row (`unRowOfRecordTy`). `P | Q` beside
`P | Q | null` matched neither test. The pair fell to the struct-union refusal, although both
operands are the same `{tag, payload}` box and `null` is one more tag of it.

`unionNulTwinTy` is a third test, keyed by type. It flattens each operand's variants, sets the
`null` members aside, and matches the rest by `memberTySame`. When only one side carries `null`,
it answers that side's type. The compare reads that type's arms. A `null` tag on either side
matches no record arm, so the staged core answers it as it does for two nullable operands. No
other routing changes, and `===` is untouched.

## Grading

- The D16038 witness prints `true` `false`.
- A 64-cell grid covered `null` on the left, right, both or neither; two and three members;
  flat and nested records; `==` and `!=`; and named and call operands. Every cell prints the
  structural answer. On master, the 16 left-null and right-null cells with named operands were
  refused. Call operands already ran, through the staged path.
- `scripts/capability-probes/matrix/struct-union-eq-null-twin.matrix.vl` delivers a
  `P | Q | null` to every position and compares it there with a `P | Q`. Its cells cover the
  other order, `!=`, a `null` value, the other arm, three members and nested records. Graded
  between the master seed and the candidate, all 64 graded cells moved from the emit refusal to
  runs, with 0 runs→not-runs, 0 silent and 0 traps.
