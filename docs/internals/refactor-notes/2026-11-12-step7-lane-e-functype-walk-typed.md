# Step 7 L2: the function-type shape walk dispatches on the type; `annFnDecompose` is gone, 2026-11-12

Lane E (w310's area: emit_base's spelling predicates and the D6 interner), cut E2. #7600 gave
`internShapeDeepTyGo` a typed dispatch: the walk branches on the arena type, and it keys each
type by its nominal name or its render. Its sibling, `internFuncTypeShapesTyGo`, interns the
inline shapes in a function type's parameters and result. That walk still cut the spelling at
each step:

- a grouping paren peel;
- the arrow split (`annFnDecompose`, an `annArrowAt` parse in emit_base);
- a `| null` peel (`nullablePartOf`);
- a union member count;
- a `[]` peel (`nameIsElemArray`).

It read the type only beside those cuts.

## Changed

- `internFuncTypeShapesTyGo(nm, ty)` is a `_`-less `match` on the type:
  - `TyFunc` walks each parameter and the result;
  - `TyNullable` walks the inner type;
  - `TyUnion` with two or more members delegates to `internShapeDeepTy`;
  - `TyArray` walks the element;
  - `TyObj` is the lowerable or non-lowerable inline-shape leaf, as before;
  - `TyMap`, `TyPrim`, `TyVar`, `TyLit`, `TyNeg` and `TyErr` intern nothing. The old walk also
    left a map to `internShapeDeepTy`.
  The value-union test and the leaf read the key `internShapeDeepTyGo` uses. That key is
  factored out as `shapeWalkKeyOf`.
- An untyped reach (`ty < 0`) interns nothing. Before, it walked the spelling.
- `annFnDecompose` (emit_base) had no caller left, and is deleted. So is `tyStepParam`
  (tyquery), whose only reader was this walk.

## Reach

A scratch probe compiler, never refreshed into a seed, put a distinctive `emitFail` on each new
arm. Over the sweep's 24,177 programs:

| arm | programs |
| --- | --- |
| `TyFunc` | 2,541 |
| `TyObj`, lowerable | 102 |
| `TyObj`, not lowerable | 28 |

Each arm is the first `emitFail` of its program, so a deeper arm's count was taken in a separate
run.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `06baca0f` against the candidate:
  - 24,177 same;
  - 0 bytes-only movers;
  - 0 output movers;
  - 0 `runs → not-runs`;
  - 0 new compiler traps.
- `scripts/gate.sh` on master `259c4329`: all 23 rows pass, among them rep-fuzz, filed witnesses, late demands, seed
  size, plumb-shape cost, the distilled corpus, scaling shape, and the dead-export budget (with
  `tyStepParam` deleted).
- Render-parse with `--findings`, on master `259c4329`: 13 renders, 30 → 28 parses.
  `annFnDecompose`'s `annArrowAt` (emit_base 16 → 15) and the walk's `nullablePartOf`
  (emit_shape_intern 3 → 2) are gone. `--write-baseline` is in this PR.
