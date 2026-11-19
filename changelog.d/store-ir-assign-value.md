## Codegen, memory & runtime (Track B)

- **IR: assignment as a value:** legacy's assignment in value position dispatches on one decision, `asgValueArmOf` (`lit`, `nullLit`, `reRead`, `parked`, `nonNullRead`, `nonNullPark`, `boxedArm`, `widerRow`, `none`). The IR builds the `reRead` arm with no unwidening on a name target: the store, then the target's read (the setter idiom `return g = v`). Byte-identical; SELF_CLAIMS.
