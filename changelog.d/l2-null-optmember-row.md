## Codegen, memory & runtime (Track B)

- **D16828 filed**: `const a = null` then `a?.f ?? 0` passes check and is refused at emit, while
  `let a = null` and a bare `null?.f` are refused at check. Whether `?.` over a value typed only
  `null` is permitted decides which side moves.
