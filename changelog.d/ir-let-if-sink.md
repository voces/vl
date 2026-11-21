## Codegen, memory & runtime (Track B)

- **IR: a binding's `if` initializer on every per-arm rung:** a union binding under the binding sink puts each arm's box into the sink pair (raw effects `sink.put`, `sink.null`, `sink.close`, through legacy's `unionBoxToPairTail`, `emitUnionNullToPair` and `unionLetSinkClose`); an arm's statements before its value are built as `emitIfArmOpen` writes them; and a `string | null` or `boolean | null` binding writes each arm with no seed and the cell's null for a missing `else`.
