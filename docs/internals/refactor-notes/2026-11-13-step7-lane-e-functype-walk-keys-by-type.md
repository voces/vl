# Step 7 D6: the function-type walk's value-union and record-leaf tests read the type, 2026-11-13

This is lane E's item 2 from closing census 5's D6 column, taken from lane F by F's agreement.
`internFuncTypeShapesTyGo` asked two questions of its walk key `ln`, the spelling
`shapeWalkKeyOf` renders:

- `isValueUnionName(ln)`: is this a value union to register and stop at?
- `nameIsShapeSpanEnds(ln)`: is this record an inline shape to intern?

Lane F's deletion of `shapeWalkKeyOf` needs every consumer of the key to read the type first.

## Changed

| test | now |
| --- | --- |
| value union | not a declared nominal, and lane G's `valueUnionNameOfTy(ty)` names a value union |
| inline record leaf (`TyObj` arm) | not a declared nominal |

`tyIsDeclaredNominal(ty)` is true when `ty`'s nominal name is a declared type (`cUserTypes`) or
a generic application. Such a type is walked under its name, as one leaf.
`internShapeDeepTyGo`'s own value-union test, inside lane F's walk, is left to F.

## Probe

A scratch compiler, never refreshed into a seed, compared the old and new answers at every reach
on master `ad113118`, over 24,205 programs:

| test | reached | disagreements |
| --- | --- | --- |
| value union | 2,544 programs | **0** |
| inline record leaf | the `TyObj` arm's 130 programs (#7627's reach) | **0** |

A first value-union candidate, `tyIsValueUnion`, disagreed in 11 programs. It missed closure,
list and nullable-scalar members (`i32|null`, `K0[]|i64`), and called a declared union (`Pet`,
`U`) a value union where the walk keys it by name.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides: 24,205 same, 0 bytes-only movers, 0 output movers,
  0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass.
