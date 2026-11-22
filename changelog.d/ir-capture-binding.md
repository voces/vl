## Codegen, memory & runtime (Track B)

- IR coverage: a closure's captured literal-union atom, `K | null` or `boolean | null` is read by the IR at the i32 its capture holds, as legacy stores it (`capRepOf`), instead of a refused reference valtype.
