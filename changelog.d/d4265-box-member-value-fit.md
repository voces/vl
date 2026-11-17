## Codegen, memory & runtime (Track B)

- **D4265 closed:** `u is A` over a record union whose other arm's shared field is a box with a member only some of whose values fit `A` (`{ v: i32 | string }` against `{ v: "a" | "b" }`, `{ v: i32 | null }` against `{ v: 1 | 2 }`) runs: the member's tag, then its payload against `A`'s literals. On master it refused at emit.
