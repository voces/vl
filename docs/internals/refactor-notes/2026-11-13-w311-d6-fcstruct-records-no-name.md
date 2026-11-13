# Step 7 L2 D6: a typed nested-record field records no element name, 2026-11-13

Lane F, D6 `nonNulBaseOf` callers: `shapeFieldElemName`'s FC_STRUCT arm. Measured at master
`99308160`, after H's #7721 and #7733.

## What changed

`shapeFieldElemName(ftxt, code, fty)` used to take the element name of a nested-record field
(code `FC_STRUCT`), whose type has no nominal name, by parsing the field's text
(`nonNulBaseOf(ftxt)`). It now records `""`. A nested-record field's target row is read off its
element type (`sFieldTgtStructIdx`), and since H's #7733 the element-row hints key on the field
code rather than the name. A field with no type is a named floor
(`SHAPE_STRUCT_FIELD_NO_TY_MSG`); the probe reaches it in 0 programs.

## Probe (master `1a24ba21`, 24,204 programs)

| FC_STRUCT text arm | programs |
| --- | --- |
| no field type | 0 |
| the type's row exists, and its label equals the text | 195 |
| the row exists, label differs (twins) | 47 |
| no row yet at record time | 201 |

**Refused first version.** On master `1a24ba21` the sweep refused this cut: 332 runs →
not-runs, all `nested-struct field element type is not interned`. Three element-row hints were
gated on a non-empty name, so emptying the name dropped the hint. H re-keyed them on the code
(#7733); that is what makes the cut land.

## Measurement

Sweep with fixpoint seeds, master `99308160` → this: all 24,205 the same.

`nonNulBaseOf` callers: 2 → 1. The one left is D16040's floor in `rlElemStructRowOfName`
(lane D).
