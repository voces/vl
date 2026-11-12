# Step 7: the shape interner's name walk is a floor until generic and hole records render, 2026-11-12

`internShapeDeepTyGo(nm, ty)` (`emit_shape_intern`) walks a type's spelling and its arena type
together. In order it handles: paren peel, value union, function, `| null` peel, composite
union, `[]`, map, then the leaf mint (`gaeEnsure(nm); internInlineShapeTy(nm, ty)`). This lane
tried to make the walk read only the type. Neither attempt ships. This note records why. The
population is 23,962 programs, master `ad86edf8`, with fixpoint seeds on both sides.

## Where the walk is reached

The walk is reached in 18,457 programs. The table counts entries per branch, by the type's kind:

| branch | entries by type kind |
| --- | --- |
| `[]` peel | array 7,915, union 3, none 4 |
| composite union | union 1,446, nullable 379, array 2 |
| map | map 3,261, object 2, union 3, none 12 |
| `\| null` peel | nullable 2,950, none 2 |
| value union | union 2,151, nullable 3,530 |
| leaf | object 7,183, other 17,015, union 2,641, function 50, none 42 |

- **The 42 typeless entries are all nested.** They are children of steps where the spelling and
  the type disagree, generic type variables, and 11 `' i32'` spellings from `fvaAnnotMinted`.
- **Where the type renders non-empty, the leaf's name equals nominal-or-render in every program.**
- **The type renders `""` in 389 programs.** These are the generic and hole types (`C<T>`,
  `{f:T}`, `T0`, `never`, `{f: i32}` under a hole function). For them the spelling is the only key
  the walk has.

## E6: the walk reads only the type (refused)

Every branch dispatches on the type, and each child's name is the child type's render. Result:
23,945 same, 10 bytes-only, **7 runs → not-runs**, **4 new compiler traps**.

| witness | before → after |
| --- | --- |
| `D14162` | runs → emit reject: `nested-struct field element type is not interned` |
| `D15640` | runs → compiler trap (module fails to validate) |
| `D15651` | runs → compiler trap (module fails to validate) |
| `closures/hole-fn-inline-list-record-stored.vl` | runs → emit reject: `ref valtype with no interned shape` |
| `functions/named-function-in-record-beside-hole-record.vl` | runs → compiler trap |
| `functions/named-function-record-beside-hole-handed-two-functions.vl` | runs → compiler trap |
| `objects/intersection-alias-field-and-nullable-positions.vl` | runs → emit reject: `nested-struct field element type is not interned` |

Every witness passes through the 389-program `""` render class, a generic or hole record, so
the walk gets no name.

## E7: type walk where the type renders, name walk elsewhere (not shipped)

The walk dispatches on the type when `tyToEmitName(ty) != ""` and keeps the name walk otherwise.
Result: **23,962 same**, but the render-parse budget rises by one render (`emit_shape_intern`
2 → 3), and no parse site is deleted. A ratchet that rises for no deleted site moves the wrong way.

## The floor

The name walk stays until generic and hole-function records carry a renderable instance type
when they reach the walk. At that point the name path goes in one change, together with the
parses it carries: the `| null` and `[]` peels, the map split, and the composite-union split.
