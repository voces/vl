# Step 7, lane H: the interner's field recorders pass the element type, 2026-11-12

`recordFieldElemRow` (`emit_rep`) banks a struct or variant field's element type beside its
element name (`sFieldElemTyIx`). When its caller hands no type (`tyHint < 0`), it resolves the
name (`fieldElemTyIxOfName`). Lane F's D6 cut 3 (#7669) made the declared and arm recorders
pass the field's type. This cut takes the shape interner's three remaining `-1` sites.

## Probe

A scratch compiler ran over 24,070 programs, with a control tag on each. It tagged every reach
where the hint was `-1` and the name resolved, by site. Where the site held a candidate type,
it compared that candidate with the name's type.

| site (`emit_shape_intern` unless named) | programs | the site's own type against the name's |
| --- | --- | --- |
| the ref-list field (`e5`): `-1` unless the element is open and its name unresolved | 185 | 29 identical, 156 structurally same, 0 differ |
| other codes (`en`): `-1` for a literal-union row | 102 + 14 | 97 identical, 5 same, 0 differ; 14 with no row |
| the nullable ref-list field (`e28`), through the untyped wrapper | 12 | 5 identical, 7 same, 0 differ |
| `emit_collect`'s literal-row and `pushFieldRow` callers | 62 + 46 + 4 | the callers hand no type (next cut) |

## The change

- `e5` passes its element type unconditionally. The `e5Open` gate and its name lookup are
  deleted.
- `e28` passes the element of its non-null part, through `recordSFieldElemRowTy`.
- `en` passes its row type for every code, a literal union included. Before, a literal union
  had its name resolved, to the same type.
- `fieldElemTyIxOfName`, `tyIsLitUnionArray` and `tyIsLitUnionAlias` leave
  `emit_shape_intern`'s imports.

**Measurement:**
- **Sweep** (`sweep.vl diff`, master `b323f223` against this, fixpoint seeds on both sides):
  24,202 same, 0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler
  traps.
- **The name fallback's reach** (the same probe after the cut): 408 → 122 programs. What is
  left: `emit_collect`'s callers that hand `-1`, `en` with no row, and the alias-shape
  recorder, which records `""`.
