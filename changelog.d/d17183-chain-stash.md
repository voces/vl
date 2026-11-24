## Codegen, memory & runtime (Track B)

- **A `??` chain whose middle operand is a field read off a call, or an `if`, builds a valid module (D17183):** `r ?? boxK(mkK(n)).v ?? "a"` over a literal union's `K | null` failed to validate ("unknown local"); the chain's coalesce stash is now reserved by the inner link's own stash decision (`coalLhsStashes`), not only for a call. Graded by a committed position matrix (`coalesce-chain-middle-stash`) with every operand logging: each runs once, in order, the default only on the null path.
