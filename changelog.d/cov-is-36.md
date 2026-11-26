## Codegen, memory & runtime (Track B)

- **IR claims a `null` boxed into a tagged union beside a softened record** (`[null, { tag: "a", v: 1 }]` into `(N | null)[]` where a `{ tag: string, v: i32 }` is declared): the box plan's `null` rung now precedes its record rungs.
