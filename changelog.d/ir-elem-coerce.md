## Codegen, memory & runtime (Track B)

- **IR: a scalar map read into its nullable box is built by the IR (`map get rep`).** Legacy boxes a bare read of a scalar-valued map entering a `V | null` box with the probe's own two-arm box (`emitMapGetScalarBox`): the value's tag and boxed payload on a hit, the null tag on a miss. The shared box plan (`holeBoxPlanOf`) now names that arm (`mapScalar`), legacy's `emitUnionBoxArg` follows it, and the IR's `RMapGet` carries the value's atom kind (`mtBox`) and lowers the probe into the same tail. Legacy bytes are unchanged.
