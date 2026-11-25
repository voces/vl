## Codegen, memory & runtime (Track B)

- IR coverage, object field explicit null (lane COV-IS): a record whose nullable map field is given an explicit `null` is built by the IR, which writes the map struct's `ref.null` as legacy does. This covers 9 of the 10 programs with the miss, 5 of them start bodies.
