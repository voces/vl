## Compiler performance

- **Three checker walks stop scanning seen-lists (lane COV-UNION):** `tyHoldsHole` and `tyUnscopedVarName` mark visited types with a per-walk epoch, and a join arm's own-storage queue test reads a membership map beside `recOwnSrc`; L2 self-compile fuel −1.46% (−1.97G), the self-compile byte-identical.
