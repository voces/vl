## Type system (Track A)

- **Partial record fit over a union runs:** `r is B` over `r: A | C`, where only some `A` values are `B`s by their fields' literal values and no `C` is, tests `A`'s tag and then the fields, where it was an emit reject. The `then` reads `r` as the `A` it is (D4089 is re-graded: narrowing to `B` itself is still open).
