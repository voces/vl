# Step 7 L2: the shape walks split a union by its type's arms; `unionSetMemberCount` is deleted, 2026-11-12

Lane E, cut E5a, from lane G's hand-over. `emit_shape_intern` asked the union registry's two
spelling parses, `unionSetAtomsOf` and `unionSetMemberCount`, at four sites. Each site already held
the union's type. G's typed reader is `unionTyArms(ty, atoms, tys)` (`emit_map_twins`): it returns
the keyed row's recorded atoms and member types, or else the member set's.

| site | decides | now |
| --- | --- | --- |
| `internShapeDeepTyGo`, value union | which members are function types to walk | members of the row the type keys (`unionMemberTysOfAB(10, ty, …)`), every function member, with no `=>` spelling gate |
| `internShapeDeepTyGo`, composite union | whether the walk splits the union into arms, and the arms | `unionTyArms` arms, split by `shapeWalkSplitsUnion` |
| `internFuncTypeShapesTyGo`, `TyUnion` arm | whether to hand the union to `internShapeDeepTy` | the same predicate |
| `annShapeWiderRowOf` (`unionSetNamesAtom`) | the wider row's union field has the query field's type as a member | `unionTyHasMemberTy` over the two storage types |

## Probe

A scratch compiler, never refreshed into a seed, compared each spelled decision with the typed one
into one accumulator per program, raised at the end of `emitProgram`. The population was the
sweep's 24,196 programs.

| site | programs reached | disagreements |
| --- | --- | --- |
| value-union function members | 4,641 | 0 (count walked) |
| composite split, `internShapeDeepTyGo` | 4,861 | see the steps below |
| composite split, `internFuncTypeShapesTyGo` | 206 | see the steps below |
| `unionSetNamesAtom` | 4 | 0 |

The composite split got to its final rule in three steps:

1. **A bare member count of 2 or more.** This disagreed in thousands of programs. The walk keys a
   declared union by its name (`Shape`, `K`) and a literal set by its member text. A numeric
   literal union is keyed by its base (`i32`). The spelling counts each of these as one atom, so
   the walk never split them.
2. **Excluding the type's nominal name.** `tyToNominalName` answers an undeclared union's own
   render, so this excluded every union.
3. **The shipped rule, `shapeWalkSplitsUnion`.** It splits only on 2 or more arms, a key that is
   no declared type (`cUserTypes`), a type that is no literal set, and no numeric literal union.
   This leaves 2 programs, D4743 and D4744. Their union `i32[] | K[]` renders `i32[]`: one rep, and
   no arm the split would intern. Arm lists then differed only in order or spelling (the
   registry's atoms against the render's), in 23 programs at most.

## Changed

- `internShapeArms(arms, armTys)` takes the typed arm pairs. Its type fallbacks and
  `unionArmTysByPos` are deleted, since the pairs come from one reader.
- `unionSetNamesAtom` is replaced by `unionTyHasMemberTy`.
- `unionSetMemberCount` (`emit_union_registry`) had these as its last callers, so it is deleted,
  with its `unionMemberCount` parse. Lane G owns that file and has been told.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `c167a4c0` against the candidate: 24,196 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps. The arm order
  changed, and no byte moved.
- `scripts/gate.sh` on the branch and on the tree merged with master `a53e6913`: all 23 rows pass, among them scaling shape, self-compile time and plumb-shape
  cost.
- Render-parse with `--findings`: 9 renders, 3 → 2 parses. `--write-baseline` is in this PR.
