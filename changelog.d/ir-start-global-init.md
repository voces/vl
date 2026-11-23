## Codegen, memory & runtime (Track B)

- **IR coverage: a hole or generic function's value initializing an annotated global.** `const f: (x: string) => string = id`, with `id` a hole or generic function, is the instance legacy picks for the cell, whose own closure rep is the cell's (`instanceClosureRep`), typed at the cell's type. Of tests/cases' 22 `start: global initializer coercion` programs on master e6cb8541, 9 start bodies are now covered and matched and 13 remain. Legacy's bytes don't change.
