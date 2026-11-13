# Step 7: `internShapeAs` reads the alias's fields off its record type, 2026-11-13

Lane E. `internShapeAs` interns a struct-alias union (`type P = {x: i32}`, a union of one inline
shape) as the named struct `P`. It took the alias's spelling and split it with
`shapeInnerFieldSplit(groupInnerOf(nm))` for the field names. The split's field texts were never
read. The function already held the alias's record type (`aliasShapeObjTy(sTyIxOfName(key))`) and
read every field's code and storage type off it.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `1c009d1c`. At each call
it compared the split's field names, as a set, with the record type's `objFieldNames`. It also
marked a call whose alias had no type or a non-record type. It was drained once after
`emitProgramRun`, over the sweep's 24,221 programs. A control fired.

- 53 calls in 48 programs.
- 0 name-set disagreements.
- 0 aliases without a record type.

Order does not matter: the names are put in canonical order (`fieldNameOrder`) afterwards.

## Changed

- `internShapeAs(key)` reads the field names from the alias's record type. Its spelling argument
  goes. An alias with no record type is a loud floor; the probe found none.
- `shapeInnerFieldSplit` (emit_base) loses its last caller and is deleted, with emit_base's
  `fieldNameOf`, `fieldTypeTextOf` and `tyTopLevelSplit` imports.
- The caller's `unionDeclStructAlias(s) != ""` gate is lane F's and stays.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `1bf62f4a` against the candidate: 24,221 same, 0
  bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all rows pass.
- Render-parse census: four `ty-string-parse` entries leave: three in `shapeInnerFieldSplit`'s
  body (emit_base) and its call (emit_shape_intern). The compiler total goes from 26 to 22.
