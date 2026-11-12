# Step 7: the shape walk keys a type by its nominal name or render, 2026-11-12

`internShapeDeepTyGo` used to walk a type's spelling. It peeled grouping parens, `| null`, `[]`
and a map value off the name, and split unions by name. Now it walks the type and keys each
node by one of three names:

- its nominal name, when the caller's `nm` is that name;
- otherwise, its render (`tyToEmitName`);
- for a record of tagged-set ids, whose function fields have no render, the spelling it is
  stored as (`monoTagMapRepName`, through the `tagRepNameFn` slot `emitProgram` installs).

Children recurse with `""` and their own type. This is E6 from
`2026-11-12-step7-shape-walk-typeless-census.md`, plus the rung that class G needed.

## Class G

Under E6 without the rung, five programs stopped running:

- D15640;
- D15651;
- `closures/hole-fn-inline-list-record-stored`;
- `functions/named-function-in-record-beside-hole-record`;
- `functions/named-function-record-beside-hole-handed-two-functions`.

w314 traced the TypeRef involved. `collectAnnShapes` walks a parameter annotation that
`monoMakeInstanceParams` mints with `synthTypeRefTy(pin, -1, pinTy)`. The pin type is a record of
tagged-set ids, `{f: Fn#a}`. A tagged set's function type renders as a hole, so the record's
render is `""`, and the type-only walk named nothing. The old walk named the row by the pin's
spelling, `{f: i32}`. That spelling is the stored rep `monoTagMapRepName` computes from the
type, and the walk now asks for it.

This is not a new name path. The pin's text is the floor recorded in
`2026-11-12-step7-tag-record-pin-kind-by-layout.md`, an instance key resolved by type.

## Cost and the cycle guard

The walk renders a type only when its nominal name does not key it. A deep record's render
doubles per level, and computing it eagerly cost 5× fuel on `vl_scaling_shape`'s diamond-depth
arms.

`nm == nominal` is also the walk's cycle guard: `shapeWalkName` passes the caller's `nm` for a
type already on the walk stack. A variant keying every type by its nominal name never finished
a sweep. Dropping `nm` needs an explicit on-stack test in its place.

## Proof

- Refresh ×2 is a fixpoint at 6,712,542 bytes.
- The candidate builds master's `compiler/entry.vl` byte-identical to master's own fixpoint
  seed (6,712,315 bytes).
- Sweep against that seed, 24,132 programs: 0 `runs → not-runs`, 0 new traps, 0 output movers.
  The 2 bytes-only movers are `generics/annotated-written-let-of-generic-read-as-itself` and
  `generics/declared-return-holds-litunion-beside-type-param`.
- `regress.vl`, lint-self, cases (7,553), rep-fuzz, seed size, late demands, plumb cost,
  self-compile time, memo and scaling, and every budget pass.
- Render-parse: the walk's one render buys two parses. Merged with master `cf01f012` (12 renders,
  40 parses), the census reads 13 and 38; the baseline is written from that measurement.
