# Five NAME-reading classifiers answer from types, rows and member sets, 2026-11-13

Lane A, the NAME-classifier rows lane H attributed to lane G (G confirmed all five free).
Emit only. The set is `rep-classifier-census --reads NAME` on master after #7711.

| classifier | read it drops | now |
|---|---|---|
| `unionRetName` (emit_start_block) | `nameIsLitUnionArmValueUnion` | deleted: no caller since #7711 |
| `coalesceResultUnionName` (emit_start_block) | `nameIsLitUnionArmValueUnion(nm)` | `msSetCarriesLitUnionArm` of the node type's member set |
| `unionSetHasAtom` + `nameIsPlainScalarAtom` (emit_union_atoms) | atom spellings compared by name | deleted; wasmEmit's `unionTyHasValueKind` compares the read's banked member kinds |
| `emitCapturedCall` (wasmEmit) | `tyNameOf(param)` | `boxTyName` of the parameter's type, as its direct twin `directArgSeedsOf` does (#7675) |
| `unionNameOfHoleReadGo` (emit_classify) | `tyNameOf(p.parType)` | the name of the row the parameter's annotation keys to |

**Census** (probe compiler, the full sweep population; old answer against new):
- **`coalesceResultUnionName`**: agrees at 958 sites in 216 programs. At 756 sites in 101 programs
  the member set is uncovered (`-1`), and the name answered false at every one, so "the set says
  yes" matches everywhere.
- **The narrowed generic read's dead-arm test** (`unionSetHasAtom`'s one caller): agrees at 73
  sites in 48 programs, none uncovered. The old test ran only where the read named a union; the
  new one runs on every narrowed generic read, and an uncovered set answers "may hold it", the old
  skip's answer. A first cut made the uncovered case a loud floor. The sweep caught it reaching 4
  programs the old name gate had skipped (D3528, D3568, `generics/annotated-join-coalesce-at-pin`,
  `generics/coalesce-over-kept-apart-join`), so it is the conservative answer, not a floor.
- **`emitCapturedCall`'s union-parameter branch and `unionNameOfHoleReadGo`'s parameter rung**:
  reached by no program. Each was converted the way its reached twin already works, not floored:
  each is a delivery position, not a fallback.

**Sweep** (master fixpoint seed vs candidate, same tree): 24,204 same, 0 bytes-only movers, 0
output movers, 0 runs → not-runs, 0 new traps.

`rep-classifier-census --reads NAME`: 14 classifiers / 29 call sites before, 9 / 20 after.
