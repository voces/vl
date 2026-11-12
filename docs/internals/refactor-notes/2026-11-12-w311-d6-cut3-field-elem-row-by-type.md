# Step 7 D6 cut 3: a struct or arm field's element row is recorded from its type, 2026-11-12

Lane F's D6 interner re-key, cut 3 (design: `2026-11-12-w311-d6-interner-rekey-design.md`).

Cut 1's opaque-label instrument (`$VL_OPAQUE_SNAMES=1`) named one decision reader behind 178 of
its 180 lost runs. A field's element type column (`sFieldElemTyIx` / the arm table's twin) was
recorded by resolving the element's stored NAME whenever the hint was withheld. The hint was
withheld for a name `elemNameIsNominal` calls nominal. A row's own label is such a name, so an
opaque `#rowN` resolved to nothing and `sFieldTgtStructIdx` found no row.

## What changed

Following the ruling that no row key needs declaration identity (#7306), the field's own type,
projected per code, is the hint at every recorder that withheld it. A literal union is still
handed over as its arena type, and a list of literal unions still declines.

| recorder | file | was | now |
| --- | --- | --- | --- |
| `iisPushFieldElem`, other codes | `emit_shape_intern.vl` | hint withheld for a nominal element name; projected from `tyIx` only | hint always projected, from `tyIx`, else `fieldsTy` (an arm mint passes `tyIx` -1) |
| `fieldElemHintOf` (declared struct and arm fields) | `emit_collect.vl` | hint withheld for a nominal element name | hint always projected (`fieldElemHintOfRow`) |
| the variant-table recorder of a shape-text arm field | `emit_collect.vl` | hint -1 | `fieldElemHintOfRow(fldTy, fldTy, fc)` |

## Measured

Fixpoint seeds over the whole sweep population, re-measured after merging master `82ca1ef1`. That
master includes #7658, which replaced `elemNameIsNominal` with a type test, `elemTyIsNominal`,
but kept the gate. This cut removes the gate.

| comparison | programs | same | bytes-only | runs → not-runs | new traps |
| --- | --- | --- | --- | --- | --- |
| master → this cut, unarmed | 24,196 | 24,196 | 0 | 0 | 0 |
| master, unarmed → armed (`$VL_OPAQUE_SNAMES=1`) | 24,196 | 23,876 | 234 | 86 | 3 |
| this cut, unarmed → armed | 24,196 | 23,953 | 239 | **4** | 3 |
| cut 1's reading (master `b20cfd07`), unarmed → armed | 24,192 | 23,782 | 230 | 180 | 1 |

So the change is byte-identical unarmed. Armed, it takes master's lost runs from 86 to 4; #7658
had already taken cut 1's 180 to 86. The ones left are the next layer:

- traps when armed (a module fails to validate): `docs/internals/inventory/D15042.md`,
  `tests/cases/generics/union-of-records-arm-holding-type-param-built-at-instance.vl` and one
  more;
- `distilled/named/d2781_run_generic_pattern.vl`: "`is` names a type that is not a union
  variant" (a variant found by name).

These, and the bytes-only movers, go to lanes B and H with the reader list, as agreed.

`elemTyIsNominal` keeps its other callers.

## Proof

Refresh to a fixpoint, at 6,716,249 bytes. `scripts/gate.sh`: ALL GATES PASS.
