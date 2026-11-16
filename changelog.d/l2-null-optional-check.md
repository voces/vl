## Type system (Track A)

- **`?.` over a receiver typed only `null` reads `null`, in every spelling** (owner ruling,
  2026-11-16). `let a = null` with `a?.f`, a bare `null?.f`, and an un-annotated or generic
  parameter handed `null` no longer refuse at check (`member access '?.f' on non-object null`).
  Written so in the program's own text, an info hint says the expression is always null. The
  emitter's lowering of such a `?.` and its `??` is lane AE4's (D16338, D16828).
