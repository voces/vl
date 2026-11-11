# Step 7 L2 §7: a union of lists with differing kinds is the union box, by type, 2026-11-11

`refListElemKindOfTy` answered -1 for every union of lists, so two callers took the element kind
from the spelling (`refArrElemKind`) even though they held the type. Those callers are collectA's
annotation arm and `ensureRefElemTys`. Base is this lane's #7158 merged with master `82e3e434`.

## Measured

The probes were `emitFail` markers at the two spelling fallbacks, in compilers built into scratch.
Counts are **programs**, over the sweep's 23,885.

| probe | before | after |
| --- | --- | --- |
| collectA: kind from the spelling with `raTy` held | 9 | 3 |
| `ensureRefElemTys`: kind from the spelling with `kindTy` held | 10 | 1 |
| either of the above, together | — | 4: `D4744`, `D6732`, `atom-list-is-beside-integer-list.vl`, `one-list-member-union-positions.vl` |
| the new type answer disagrees with the spelling, at a union element | — | 1, `types/intersection-alias-recursive-positions.vl` (`M[]`, an intersection). The type already decided that program before this change, and its wasm is byte-identical |
| control: the type answer agrees with the spelling at a union element | — | 877, the six distinct-kind programs among them |

The four left are all `i32[] | K[]`, whose two arms share the i32 list's kind. The checker gives
that type both spellings, `i32[][]` (kind 4) and `(i32[]|K[])[]` (kind 2). The spelling chooses
there, by the existing design.

## Changed

- `rlUnionElemKindOfTy`: a union whose arms are all lists asks `rlListUnionKindOfTy`. That answers
  the union box (`RLK_UNION`) when two arms' list kinds differ, and -1 when they share one.

The ladder behind `nameIsRefArray` and `refArrElemKind` (`refArrShapeKindGo`) keeps its callers:

| caller | why |
| --- | --- |
| `fieldCodeOfSpelling` → `nameIsNulRefList` | w309's |
| `emit_shape_intern` at a `TyVar` field | no element type until the monomorphizer pins it |
| the two fallbacks above | the 4 `i32[] \| K[]` programs, and the 4 with no type |

collectAArrayLit's kind-9 arm reaches the inner-name cut (`refArrElemName`) in 24 programs. In 21
of them the recorded type still holds an unfilled function hole (`{fs: ((_) => _)[]}` against the
built `{fs:i32[]}`), so the type names no row. In the other 3 there is no type. Both are floors.

## Proof

- One refresh, at 6,619,647 bytes. The six distinct-kind programs and the disagreeing one build
  byte-identical wasm against the base seed.
- `regress.vl` reports no runs lost. lint-self, rep-fuzz (exact), seed-size, and the render-parse,
  kind-ladder and comment budgets pass. The render-parse count is unchanged.
- The full population is graded by CI's Sweep job.
