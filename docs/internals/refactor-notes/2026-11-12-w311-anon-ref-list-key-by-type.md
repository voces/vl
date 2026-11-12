# Step 7: an anonymous ref-list field's key is its element type's row name, 2026-11-12

`anonRefListElemKeyOfTy` (`emit_anon_fields.vl`) keyed a list field with no struct row in two
steps. It rendered the whole array type with `tyToNominalName`, then cut the element back out of
the spelling with `refArrElemKeyDeferred`. It now names the element type directly with
`fieldElemRowName`, which is exported from `emit_shape_rows.vl` for this.

## Measurement

An `emitFail` probe compared the two keys where the function reached that rung, on 61 cells of
the sweep population. Examples are `(i32|f64)[]`, `Shape[]` and `({x:i32}|null)[]`. The two
never differed. A second probe that fires on every reach confirmed the rung is live.

Fixpoint seeds on both sides, over the whole sweep population, base master `8580f63d`+: same
23,966, bytes-only 0, output movers 0, runs → not-runs 0, new compiler traps 0.

The render-parse count does not move. `refArrElemKeyDeferred` still serves
`shapeFieldTypeCompatK` and `shapeFieldElemName`'s arms for open template elements.
