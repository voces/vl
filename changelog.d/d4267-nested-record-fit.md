## Codegen, memory & runtime (Track B)

- **D4267 closed:** `u is A` where a field of the value is a nested record only some of whose values fit `A`'s (`{ v: { x: i32 | string } }` against `{ v: { x: i32 } }`) runs: the nested record is tested field by field, a box by its tag, a literal set by value, and a deeper record the same way, over a union and over a single record. On master it refused at emit.
