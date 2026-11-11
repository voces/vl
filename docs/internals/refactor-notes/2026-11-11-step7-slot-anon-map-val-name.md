# Step 7 slot layer: an anonymous record's map field carries its value type, and `anonMapValName`'s key render goes, 2026-11-11

w312's site list (`2026-11-11-step7-l2-w312-sites.md`) classed `anonMapValName`'s `tyToEmitName`
render as an mv-slot key. Base is master `2fb114d7` (#7188).

## What the render fed

`anonFieldElemName` stored the render as the `sFieldElemName` entry of an anonymous literal's map
field (codes 19 and 29). It had two readers:

- **The row's element type.** The literal's mint passed no type hint for a map field, so
  `recordFieldElemRow` re-parsed the stored name: `fieldElemTyIxOfName(nm)`. `sFieldMapShape`
  then found the mv slot by that type.
- **The code gate.** `anonFieldCode` and `anonCodeAdmitsValue` admitted the field only when the
  name was non-empty.

## Measurement

There were three candidates, each a fixpoint pair built into scratch from the base seed. Each was
swept over the whole population (`scripts/sweep.vl`, 23,909 programs) against base:

| candidate | same | `runs → not-runs` |
| --- | --- | --- |
| stored name `""`, gates reading the stored name | 23,862 | 47 (the gate refused the field, so the literal had no row) |
| stored name `""`, gates asking the render directly | — | the three hand witnesses fail at `mvSlotOfValTyFindK`: the row's type came from the name |
| the row is handed the value type; stored name `""` | **23,909** | **0** |

In the third candidate nothing reads the stored name's content. The 47 cells from the first row
are the map-field cells of `tests/cases/maps`, `tests/cases/closures` and the D9061–D9302
inventory rows. All run under the third candidate.

## What changed

- **`anonFieldElemValTy(valIx, code)`** (`emit_anon_fields.vl`) is the map's value type: code
  19's map, or code 29's `| null`-peeled map. The literal's mint passes it as the row's element
  type, the same hint a record or ref-list field already passes.
- **`anonFieldElemName`'s two map arms are deleted.** A map field stores `""`.
- **`anonMapValName` becomes `anonMapValNameable(mapTy)`.** It is the gate's predicate: a
  literal-union alias, else `tyEmitNameNonEmpty`, the arm-for-arm twin of
  `tyToEmitName(·) != ""`. The render stays only as the floor for a cyclic value, where
  `tyEmitNameNonEmpty` answers -1 because the name depends on where it is asked.

The gate keeps its old answer by construction. The stored name was measured unread.

## Proof

<!-- gates -->

## What is left

The declared-annotation producers (`shapeFieldElemName`'s code-19 and code-29 arms) still store a
map value spelling. Each one's row can carry its type the same way. Their readers are the same two,
so the same measurement applies.
