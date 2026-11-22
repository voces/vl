## Codegen, memory & runtime (Track B)

- **IR: a union box narrowed to a `string | null` or `boolean | null` niche reads at that niche (`narrowed read`).** `const x = pickS(1); if !(x is i32) { take(x) }` over a `string | i32 | null` reads `x` as legacy's `niche` arm writes it: the box at its storage, then the null tag tested to the niche's null and any other arm unboxed. The tail is legacy's own, now `emitNicheReadTail`, which the IR's new `RNicheRead` lowers through. Legacy bytes are unchanged.
