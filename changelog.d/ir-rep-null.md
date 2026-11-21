## Codegen, memory & runtime (Track B)

- **IR coverage: the `null` unit rep.** A function whose result is the `null` unit, a `null` delivered at that unit, and a read of a `null` unit binding now build. The builder refused the unit at `rep null` and `result rep null`, though the verifier's `RNullOf` rule and the lowering already held it. A unit value is legacy's null: `RNullOf` of `NULL_OWN_NONE` at the unit (the bottom ref), and a `nulnone` read is its destination's null (`emitNullAt`, `nullOwnAt`). Any other destination rep is a named miss, `null unit read rep`.
