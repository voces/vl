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

## Proof

Filled in from the gates below.
