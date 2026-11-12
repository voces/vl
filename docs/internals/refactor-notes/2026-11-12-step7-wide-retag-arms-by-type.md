# The wide-arm box and its retag pairs read a union's arms by type, 2026-11-12

Lane A, for lane G's step-7 L6 slice. Emit only.

**The change.** `emitUnionWideArmBox` and `wideRetagPairs` (wasmEmit) used to hold a union's
arms as spellings and turn each into a variant row with `variantIndexOf`, so twin arms sharing a
spelling became one row. They now hold variant rows: `armRowsOfUnionTy` reads a union type's
member types (`unionTyArms`) and picks, for each one, the union's own row of that type
(`unionArmRowOfTy`), else the first row of it (`exactArmRowOfTy`). `armsHoldHeap` and
`wideArmOfRow` take those rows. The retag source is the expression's box type
(`unionBoxTyIxOfExpr`), not the name `unionNameRowOfExpr` gives it. Where a type's arms do not
resolve, the spelling still answers, as before.

**Census** (probe compiler on master, the full sweep population of 24,196 programs; each cell
compares the multiset of (tag, heap, struct row) per arm, or the retag pairs themselves):

| site | agree | differ | uncovered (spelling answers) |
|---|---|---|---|
| `emitUnionWideArmBox` arms | 105,691 sites / 6,952 programs | 11 / 2 | 125 / 102 |
| `wideRetagPairs` target arms | 1,514 / 925 | 0 | 0 |
| `wideRetagPairs` source arms | 1,512 / 923 | 0 | 2 / 2 |
| `wideRetagPairs` pairs built | 1,512 / 924 (6 sites with pairs) | 0 | 2 / 2, both building none |

The 11 differing sites are the twin arms of `numeric-tag-twin-arm-read.vl` and
`numeric-tag-unnarrowed-read.vl` (`{ k: 1, n: i32 } | { k: 2, n: i32 }`): by spelling both arms
were one row, by type each is its own. Both programs print as before.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,196 same, 0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps.
