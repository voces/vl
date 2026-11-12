# Step 7 L6: the shape interner registers its value unions from their types, 2026-11-12

Lane E, from lane G's hand-over (cut 5a, #7651). `emit_shape_intern` registered a value union at
five sites through `registerValueUnionNameAB(site, name, ty)`. Each handed over both the spelling
(`ln`, `e5`, `e28`, `en`) and the type. Every site now calls `registerValueUnionOfTy(site, ty)`,
which derives the row's name from the type: `valueUnionNameOfTy`, else
`valueUnionKeyTextOfTy`.

| site | function | type handed over |
| --- | --- | --- |
| 7 | `internShapeDeepTyGo` | the walked type |
| 8 | `internFuncTypeShapesTyGo` | the walked type |
| 61 | `iisPushFieldElem`, ref-list field | the field's element type |
| 62 | `iisPushFieldElem`, nullable ref-list field | the non-null field's element type |
| 63 | `iisPushFieldElem`, other codes | the field's type |

## Probe

The probe is lane G's, run over the sweep population (#7651's note). It compared each caller's
name with the type-derived name, and found 0 differences at all five sites:

| site | calls |
| --- | --- |
| 7 | 30,760 |
| 8 | 427 |
| 61 | 25 |
| 62 | 1 |
| 63 | 981 |

G's later bisect cleared the skip class: a type that spells no value union.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `f5fa3602` against the candidate: 24,202 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass, on the branch and on the tree merged with master `b323f223`.
- Render-parse: unchanged at 9 renders and 2 parses. No parse site moves: the spellings these
  calls handed over were never parsed here.
