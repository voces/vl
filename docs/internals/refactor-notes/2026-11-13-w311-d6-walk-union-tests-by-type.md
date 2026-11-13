# Step 7 L2 D6: the shape walk's union tests read the type, 2026-11-13

Lane F, D6, toward deleting `shapeWalkKeyOf`'s render. Measured at master `50fa7f83`, with lane
E's type-side `tyIsDeclaredNominal` (#7745).

## What changed

Two decisions in the shape walk stop reading the walk key's text `ln`.

- **The value-union test** in `internShapeDeepTyGo` was `isValueUnionName(ln)`. It is now
  `walkValueUnionTy(ty)`: `valueUnionNameOfTy(ty)` names a value union, and no member is a
  declared type (`tyIsDeclaredNominal`). A walk keyed by a declaration's name (`byDecl`) is one
  leaf and never a value union.
- **The declared-union test** in `shapeWalkSplitsUnion` was `cUserTypes[ln]`. It is now `byDecl`
  plus the type's own declaration: `structNameOfTy` or `unionAliasDeclNameOfTy`.

## Decision table (probes, the whole population)

The walk was reached in 18,619 programs. Against the first typed versions:

| test | first typed version | differences | resolved by |
| --- | --- | --- | --- |
| value union | `!byDecl && valueUnionNameOfTy(ty) != ""` | 3 (`V \| null` with `V` a declared `i32 \| string`) | a declared member keeps the union from spelling its atoms |
| declared union | `byDecl && tyIsDeclaredNominal(ty)` | 2 (`i32[]`, whose generic-application leg is no `cUserTypes` entry) | the struct and union-alias legs only |

An earlier probe used `kn == tyToNominalName(ty)` alone as "keyed by a declaration". It differed
in 4,641 programs, because an anonymous union's nominal name is its own text. Lane E's predicate
is what makes the table close.

## Measurement

Sweep with fixpoint seeds, master `50fa7f83` → this: all 24,207 the same. The compiler's own
seed shrinks by about 7.6 KB at fixpoint.

## Left of `shapeWalkKeyOf`

`gaeEnsure(ln, ty)`, and the leaf's `internInlineShapeTy(ln, ty)` label, which waits on lane E's
step (d).
