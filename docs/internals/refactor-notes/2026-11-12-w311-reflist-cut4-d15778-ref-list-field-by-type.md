# Step 7 L2: a shape's ref-list field names its element by type, and the refArr* name cluster is deleted (D15778), 2026-11-12

Lane F's cut 4. `iisPushFieldElem` (`emit_shape_intern.vl`) recorded a ref-list field's element
name. It read the name off the field's spelling, through `refArrElemName`, and then two
struct-table rungs on the cut spelling, before it asked the type. That arm was the last root of
the name-based ref-list cluster in `emit_shape_rows.vl`:

- `refArrShapeKind` and `refArrShapeKindGo`;
- `nameIsRefArray` and `nameIsRefArrayGo`;
- `refArrElemKind`;
- `refArrElemName` and `refArrElemNameGo`;
- the cluster's answer cache (`ras*`) and `shapeElemDeclaredStructIdx`.

The keying decision was Family B's. The coordinator ruled it type-first, after #7306's census found
that no row key needs declaration identity. Stacked on cut 3
(`2026-11-12-w311-reflist-cut3-shape-map-field-spelling-legs.md`). Lanes E (owner of the file) and
B were told before the change.

## Measured

Validated `emitFail` probes over the sweep population (24,170 programs), counted as the first
marker per program:

| probe | programs |
| --- | --- |
| control: the FC_REF_LIST arm reached | ≥ 185 |
| the type answer is empty | 0 |
| the type answer differs from the spelling ladder's | 31 |

The 31 are D15778's class. The type names the declared twin, and the spelling the structural
render. For example, `A` against `{x:i32}` (D3875), `Tex|null` against `{w:i32}|null` (D15778), `S`,
`I<i32>`, `GB<i32>|null`, `Circle`, `T`, `P|null`, `Inner|null`, `{[string]:A}` and `A[]`.

The arm now records `shapeFieldElemName(texts[pi], FC_REF_LIST, <field type>)`. An empty answer
is an invariant `emitFail`.

## Sweep

Fixpoint seeds, cut 3 against cut 4, the whole population: 24,163 the same, 7 bytes-only, 0 output
movers, 0 runs → not-runs, 0 new compiler traps. Every mover keeps its size, type count and line
count:

- `inventory/D15778`;
- `inventory/D2528`;
- `generics/generic-alias-nullable-struct-list-field.vl`;
- `generics/generic-alias-union-element-list-field.vl`;
- `generics/ufcs-self-nullable-type-param-field.vl`;
- `unions/variant-twin-map-elem-list-field.vl`;
- `unions/variant-twin-nested-reflist-field-struct-twin-elem.vl`.

## Counts

| measure | before | after |
| --- | --- | --- |
| emitter type-string parses (render-parse census) | 34 | 28 |
| `emit_shape_rows.vl` parses | 9 | 4 (all lane H's) |
| slot-layer name producers (`vkind-census.vl -- --slots-list`) | 13 | 12 (`shapeElemDeclaredStructIdx` is gone) |
| compiler lines | — | −444 |
| seed bytes | 6,735,818 | 6,730,261 |

## Left dead for their owners

These now have no caller in `compiler/`; the census keeps them live because test comments name
them. Their owners delete them:

- in `emit_base.vl` (lane E): `nameIsClosureArray`, `nameIsI32ListArray`, `nameIsMapArray`,
  `parenUnionArrElemName`;
- in `emit_rep.vl`: `repRowOfName`.

## Proof

Refresh to a fixpoint, at 6,730,261 bytes. `lint-self.sh` (with the export budget at 0), `regress.vl`
(no runs lost), `rep-fuzz-check.sh` (exact), `check-filed-witnesses --strict` (4,847 as filed),
late-demands, seed-size (+2.1%), plumb-shape-cost and the render-parse budget (written) pass.
