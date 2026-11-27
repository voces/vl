## Type system (Track A)

- **Three checker walks stop scanning seen-lists (lane COV-UNION):** `tyHoldsHole` and `tyUnscopedVarName` keep their visited types in a map of their own walk, and a join arm's own-storage queue test reads a membership map kept beside `recOwnSrc`; L2 self-compile fuel −1.23% (−1.66G), the self-compile byte-identical.
