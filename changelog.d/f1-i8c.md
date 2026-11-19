## Codegen, memory & runtime (Track B)

- **IR I8c part 1, the atom decode as an op:** a literal-union atom delivered at a `string`, or a `K | null` at a `string | null`, is an `RAtomStr` op the IR builds at the delivery and lowers through legacy's atom decode (`atomStrTail`), so a function whose only blocker was that conversion is now built by the IR (133 corpus functions).
