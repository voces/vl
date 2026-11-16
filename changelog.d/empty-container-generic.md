## Type system (Track A)

- **D15040, D16207 closed:** an empty `Set()` or `Map()` handed to a type parameter nothing else
  types closes to the container the literal is built at (a hole set element as `string`), and a
  generic call's result over one reads at its instance's closed type: `one(Set())` prints `1`,
  `take(Map()).length` prints `0`. Residue D16725 (an empty container nested in a list literal).
