# IR `is` over a boxed-nullable field (2026-11-25, lane COV-IS)

- **The miss**: `is member storage rep`. An `is` on a record field (`memStruct`) read at its
  storage took a plain box or a boxed nullable over a plain value (`storedNullableOfValue`); a field
  held as a nullable over a union box (`F | null | string`, disc 4 over a box) declined, though
  legacy reads that field's box tag the same way.
- **What landed**: the test takes any field held as a box (`heldAsBox`). The narrowed read after it
  (`o.v + "!"`) builds a field read (`RGetField`) that unboxes the boxed nullable; the verifier's
  `unboxed` clause now admits a boxed nullable kid as it admits a box (the same `{tag, payload}`
  struct), where it failed rule 2.
- **The class** (`VL_IR_SHADOW=2`, CENSUS's list at `0c946159`): `narrowed-literal-niche-positions`,
  `nullable-litunion-arm-of-box-prints` (@start), `empty-list-is-nullable-operand` (@start),
  `narrowed-place-read-binds-narrowed-box` (4) and `narrowing-after-then-arm-call` now match;
  `box-narrowed-to-nullable-list-copied`, `value-union-*` and the `narrowed-nullable-*` programs move
  on to `pre-path niche read`.
- **Behaviour parity**: `maps/record-map-miss-into-wider-union.vl`'s start body, claimed now, builds
  other bytes than legacy's (a `?.get` guard `if` boxed per arm, legacy boxing it whole; a
  pre-existing divergence the miss hid) and runs alike: `ir-parity.vl --behaviour-only` reads
  `same, behaviour`.
- **Q58 position sweep** (`tests/cases/unions/is-boxed-nullable-field-positions.vl`, new): a
  parameter's, a global's, a nested, a closure-union and a loop element's field, plus that start
  witness (its unused `local` is load-bearing). On master 5 functions are this miss; here 6 match.
