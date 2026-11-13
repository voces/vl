## Codegen, memory & runtime (Track B)

- **D1680 and D16035 closed:** a standalone `?.` whose leaf field is a map (`b?.y` with `y: {[string]: i32}`) compiles, as the map's own nullable reference, at every key kind, un-annotated or with a `??` map default.
