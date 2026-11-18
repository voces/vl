# The IR's `emitExpr` re-entries, ranked by the legacy lines each keeps on the claim path, 2026-11-18 (lane STORE)

`scripts/ir-driver-census.sh` on master `ca161b8a`, over the self-compile plus every distilled
cell. Each re-entry ir-design §10.1 names is wrapped in the probe, so a driver the IR's lowering
reaches through it carries the door `@re:<name>`. `emitExpr` itself has no `@ir` door: its only
claim-path doors are re-entries, so the list is complete for it.

| re-entry | leaves the claim path | of which no other door | total reach |
|---|---:|---:|---:|
| `emitBoxAroundHole` | 1,434 lines, 57 drivers | 14 lines, 1 | 8,306 lines, 508 |
| `loopHoistOpen` | 934, 28 | 0 | 6,330, 375 |
| `mapGetOrHelperRoute` | 357, 11 | 0 | 7,063, 429 |
| `forInLoopOpen` | 167, 6 | 0 | 345, 29 |
| `strEqTail` | 124, 6 | 0 | 2,097, 117 |
| `popDropTail` | 38, 3 | 0 | 160, 21 |
| `emitStaticLitAtom` | 9, 1 | 0 | 64, 8 |

"Leaves the claim path" counts the drivers the claim path reaches through that re-entry and
nothing else (no `@ir`, no other re-entry). Most of each total reach is also reached by `@ir`
directly, as shared helpers. Almost nothing is freed outright: unclaimed function bodies still
reach these drivers. `emitBoxAroundHole`'s 57 are the union coercion family
(`emitUnionCoerceValueAtom`, `coerceValueAtomKind`, `emitUnionCoerceList`, `emitUnionCoerceRecord`
and kin); `loopHoistOpen`'s are the hoisted receiver's member and name reads.
