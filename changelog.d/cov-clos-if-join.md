## Codegen, memory & runtime (Track B)

- IR coverage, value `if` joins (lane COV-CLOS): an arm reading a `null`-typed binding into a nullable record join, a value `if` of record literals delivered to a record whose field is a numeric union (D15020), and a value `if` whose join is the `null` type are now claimed, each byte-identical to legacy.
