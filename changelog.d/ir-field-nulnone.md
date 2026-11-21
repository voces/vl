## Codegen, memory & runtime (Track B)

- **IR: a `null`-unit record field takes its slot's null:** a variant or struct literal's field of the `null` unit type, given a bare `null` or a name, is built as the bottom ref legacy writes after `emitNulNoneForEffect`'s empty effect (`nulNoneWritesNothing`); the verifier admits `NULL_OWN_NONE` at the unit's rep. A value that runs for effect stays a named miss.
