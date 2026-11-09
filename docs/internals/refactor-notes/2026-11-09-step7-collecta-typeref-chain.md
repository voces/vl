# Step 7: `collectATypeRef`'s empty rungs fold into two named guards

Measured 2026-11-09 on a 4-core box. Both seeds are fixpoints. The base is #6970's head
`a36f72f2`. The population is the sweep's 23,775 programs.

## What moved

`collectATypeRef` (`emit_collect.vl`) was an `else if` chain of eighteen rungs, and four of them
did any work: the bare-map and nullable-map rungs mint a map-value slot, the ref-array rung
interns a ref-list row, and the array rung validates the name (`checkArrName`). The other rungs
were empty. They existed only to stop a rung below them from running.

* The function-type rung's inner chain of four empty rungs is gone. The rung itself stays empty,
  because a trailing `[]` on a function's result is not an array.
* The empty rungs between the map rungs and the ref-array rung are now `annArrayRungsSkip`: a
  string list, a generic alias's array field over its parameter (D11450), and `(T | null)[]` over
  a type parameter (D2525).
* The empty rungs between the ref-array rung and `checkArrName` are now `annScalarOrOpenArray`:
  `f64`, `i64`, `f32` and `u8` lists, and an array over a type parameter.
* The five rungs after `checkArrName` guarded nothing and are deleted.

## What stands, and why

The working rungs were each deleted alone to find their readers:

| rung deleted | same | runs → not-runs | new traps | what refuses |
| --- | --- | --- | --- | --- |
| both map rungs | 23,259 | 120 | 107 | `unsupported map value type`, invalid wasm at top level |
| the ref-array rung | 22,304 | 799 | 39 | `ref valtype with no interned shape` (1,282 messages) |

Both readers look up a slot without minting it: the map-value slot through the mv table, and the
ref-list shape through the type-index assignment. A rung can move to its reader only once that
lookup mints on a miss and the minted slot takes its types at mint time, as ref-list rows do since
#6965. `checkArrName` is a refusal, so it stays where every annotation passes it.

## Proof

* Sweep diff, base against candidate: 23,775 same, 0 bytes-only movers, 0 output movers.
* Seed: 6,583,406 → 6,583,358 bytes (−48).
