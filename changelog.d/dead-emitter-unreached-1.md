## Codegen, memory & runtime (Track B)

- Deleted 19 compiler functions (and the `typeDeclNameIx` index only one of them read) that no call path from the seed's entry or top level reaches; the emitted bytes of every distilled cell, tests/cases program and the self-compile are unchanged.
