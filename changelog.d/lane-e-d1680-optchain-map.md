## Codegen, memory & runtime (Track B)

- **D1680 closed:** a standalone `?.` whose leaf field is a map (`b?.y` with `y: {[string]: i32}`) compiles, as the map's own nullable reference.
