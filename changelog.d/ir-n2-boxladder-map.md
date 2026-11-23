## Codegen, memory & runtime (Track B)

- **IR coverage, a second coalesce batch:**
  - An atom-valued map read boxed into a hole union now takes the box plan's atom rung, as legacy's ladder does.
  - A boxed scalar map read verifies at the box of a wider union.
  - The `holeMap` coalesce arm builds legacy's null-test `if`.
  - A union-field `??` over a box narrowed to one record arm unwraps the receiver after each read (`coalArmRecvCast`).
  - A `boolean | null` `??` joining a union box shares legacy's split writer (a new `nulBoolJoin` coalesce arm).
