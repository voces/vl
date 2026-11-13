# Step 7 L2 D6: the shape walk's union tests read the type, 2026-11-13

Lane F, D6, toward deleting `shapeWalkKeyOf`'s render. Measured at master `50fa7f83`, with lane
E's type-side `tyIsDeclaredNominal` (#7745).

## What changed

Two decisions in the shape walk stop reading the walk key's text `ln`:

- **The value-union test** in `internShapeDeepTyGo` was `isValueUnionName(ln)`. It is now
  `walkValueUnionTy(ty)`, memoized per type for the program. It is `isValueUnionName`'s count
  over the member TYPES (`valueRowKind`, `valueAtomKind`'s typed twin): two non-null value atoms,
  or one scalar beside `null`.
  - A declared member is no atom (`tyIsDeclaredNominal`).
  - A member the typed kinds do not claim (a nested set, a literal, a nullable) asks the
    spelling, `valueUnionNameOfTy`.
  - A walk keyed by a declaration's name (`byDecl`: the key is the nominal hint) is one leaf.
- **The declared-union test** in `shapeWalkSplitsUnion` was `cUserTypes[ln]`. It is now
  `byDecl` plus the type's own declaration, `structNameOfTy` or `unionAliasDeclNameOfTy`.

## Decision table (probes, the whole population)

| test | candidate | differences | programs reached |
| --- | --- | --- | --- |
| value union, a declaration-keyed walk taken as `kn == tyToNominalName(ty)` | — | 4,641 (an anonymous union's nominal name is its text) | 13,925 |
| value union, `!byDecl && valueUnionNameOfTy(ty) != ""` | — | 3 (`V \| null`, `V` a declared `i32 \| string`) | 18,619 |
| value union, this PR | member types | **0** | 18,562 |
| declared union, this PR's piece alone | `byDecl && (struct \|\| union alias)` | 62, all answered alike by `shapeWalkSplitsUnion`'s later rungs (literal and numeric-literal unions): no byte moves | 18,562 |

**Cost.** Spelling every walked union (`valueUnionNameOfTy`) took the scaling-shape "diamond
record depth" pair from under 4.45 to 13.3. A union of a deep-record function and `null` was
spelled past its depth cap and declined, so the walk descended into it. The memo alone gave 8.4.
Counting over member types gives a function member its kind (11) with no render: 56.0M guest fuel
on the generator's diamond, against master's 56.0M.

## Measurement

Sweep with fixpoint seeds, master `bac3d89b`+ → this: all 24,207 the same.
`vl_scaling_shape_test.ts` passes 90 of 90.

## Left of `shapeWalkKeyOf`

`gaeEnsure(ln, ty)` (lane A's P4), and the leaf's `internInlineShapeTy(ln, ty)` label, which waits
on lane E's step (d).
