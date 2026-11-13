# Step 7 D6 (d): the inline-shape interner reads its fields off the record type, 2026-11-13

This is lane E's step (d). It closes the D6 interner re-key on lane E's side: after lane F's
#7741 and #7747, the field split's texts had no reader left.

## Changed

- `internInlineShapeTyGo` takes its field names and field types from the record type
  (`TyObj.objFieldNames` / `objFieldTypes`) instead of `shapeInnerFieldSplit(groupInnerOf(nm))`.
  A spelling with no record type behind it interns nothing. The empty-body text test goes: a
  record with no fields is the zero-field layout.
- A field with no type now meets the loud floor `IIS_SHAPE_FIELD_NO_LAYOUT_MSG`. It replaces
  the floor that coded the field from its text.
- The loop's writes to `ftxt` had no reader, so they go, and `armTwinRowName` goes with them.
- `internShapeFieldElemsTy` is deleted: a split, an `arrLeafNameOf` peel and a `tyStepArrRun`
  walk that pre-interned array-leaf shapes. The field loop's `internShapeDeepTy(fldTy)` already
  interns every field's leaves before any row is pushed.

`internShapeAs` keeps its split, because its field codes still read the field text.

## Probe

The probe used a scratch compiler, never refreshed into a seed, on master `6ec3ca16`. A
distinctive `emitFail` fired on any disagreement, and a control (the probe forced on) fired on a
one-record program. The population was the sweep's 24,207 programs. Wherever the split ran:

| question | disagreeing programs |
| --- | --- |
| the split's field names equal `objFieldNames`, in order | 0 |
| a spelling that spans a brace arrives with no type | 0 |
| a spelling that spans a brace arrives with a non-record type | 0 |
| an empty split disagrees with an empty record | 0 |

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `6ec3ca16` against the candidate: 24,207 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- Render-parse census, regenerated with `render-parse-origins.ts`: `ty-string-parse` 66 → 64
  (both deleted `shapeInnerFieldSplit` sites); 63 after merging #7753.
- `ty-source-parse` 25 → 19. Two of the six left with this PR's deletions. The other four,
  `nameIsGenAppDecl`'s `gaeHeadNameOf`/`gaeLtAt`, are no longer reached by any sweep program,
  so the origin probe leaves them ungraded and they count as `ty-parse-unclassified`
  (`emit_shape_rows.vl` 0 → 4). Lane A's typed `nameIsGenAppDecl` deletes them.
- `scripts/gate.sh`: all rows pass.
