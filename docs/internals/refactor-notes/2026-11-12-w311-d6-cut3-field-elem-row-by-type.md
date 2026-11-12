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

Fixpoint seeds over the whole sweep population (24,192 programs).

| comparison | same | bytes-only | runs → not-runs | new traps |
| --- | --- | --- | --- | --- |
| master → this cut, unarmed | 24,192 | 0 | 0 | 0 |
| this cut, unarmed → armed (`$VL_OPAQUE_SNAMES=1`) | 23,952 | 237 | **3** | 2 |
| cut 1's reading, unarmed → armed | 23,782 | 230 | 180 | 1 |

So the change is byte-identical unarmed. Armed, the decision readers it removes take the lost
runs from 180 to 3. Two programs are now traps rather than rejects; they are among the three that
remain:

- `docs/internals/inventory/D15042.md` and
  `tests/cases/generics/union-of-records-arm-holding-type-param-built-at-instance.vl`: an armed
  module fails to validate in `g` (an arm row of a type-parameter record);
- `distilled/named/d2781_run_generic_pattern.vl`: "`is` names a type that is not a union
  variant" (a variant found by name).

These, and the 237 bytes-only movers, are the next layer. They go to lanes B and H with the
reader list, as agreed.

`elemNameIsNominal` keeps its other callers.

## Proof

Refresh to a fixpoint, at 6,710,159 bytes. `scripts/gate.sh`: ALL GATES PASS.
