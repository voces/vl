## Codegen, memory & runtime (Track B)

- **IR coverage: a `boolean | null` boxed into a wider union as its niche.** A nullable boolean passed or bound where `boolean | i32 | null` (or `| string | null`, `| f64 | null`) is expected missed at `box ladder`. Legacy tests the value against 2 and boxes the union's null or the boolean. The box plan now names that arm (`nulBool`, by `nulBoolBoxesInto`), and legacy writes it through the same head and tail.
