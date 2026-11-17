## Type system (Track A)

- **D16944 closed (and D4173):** a generic whose returns join its `T`, `null` and then a concrete value (`if k == 0 { return a0 } if k == 1 { return null } return 7`) infers all three members: `g(true, 2)` returns `7`, and a literal-union instance returns its non-member string. On master the later return was absorbed into `T | null`, printing `null` at `boolean`, failing to validate at `string`, and refusing at emit at a literal union.
