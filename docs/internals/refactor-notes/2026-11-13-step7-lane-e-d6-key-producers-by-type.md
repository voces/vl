# Step 7 D6: the interner's nested-field, gen-app and arm-mint key producers read the field's type, 2026-11-13

Lane E, D6 step (b), co-owned with lane F, under the coordinator's twin ruling: rows are keyed by
type, and twins share a row. `internInlineShapeTyGo` had three field-key producers. Each peeled a
field's spelling with `nonNulBaseOf`, and the arm mint then looked the result up by name:

| producer | was | now |
| --- | --- | --- |
| `nestedFieldShapeRow` | `internInlineShapeTy(nonNulBaseOf(ftxt), …)`, the nested record row keyed by its spelling | the non-null field type's row: `structRowOfRecordTy`, else lane F's `internShapeDeepTy` leaf row |
| the gen-app rung (D4556) | `nameIsConcreteGenAppDecl(nonNulBaseOf(ftxt))` | `fieldIsConcreteGenApp(fldTy)`: the non-null type names an application and holds no type variable |
| the arm-mint test (D15095) | `variantIndexOf(nonNulBaseOf(ftxt))` | `exactArmRowOfTy(nonNullTy(fldTy))` |

`shapeFieldsRideTyParam`'s generic-application test changed the same way: it reads the field
type's array leaf, and is true when that leaf is an application still holding a type variable.

That left `genAppRidesTyParam`, `nameIsConcreteGenAppDecl`, `gaeArgIsTyParam`, `fnTyParamName` and
`genTyParamLeaf` (`emit_shape_rows`) without callers. They are the spelling analysis of `B<T>`
arguments, and they are deleted. Four `nonNulBaseOf` calls go.

## The twin ruling

My earlier probe, and lane H's #7703, found about 75 programs where an inline field spelling and
the declared or applied type it equals (`{v:i32}` / `Box<i32>`) had two rows. The coordinator ruled
that types are structural and twins share a row. A merged row with identical output is
expected. An output mover, a `runs → not-runs` or a new trap would veto the cut.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `a3968a5a` against the candidate:
  - 24,202 same;
  - 2 bytes-only movers: `unions/self-recursive-arm-field` and
    `unions/struct-holding-self-recursive-arm`;
  - 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- The two movers are the recursive-arm cells. Both builds disassemble to identical text
  (`wasm-dis`: 94 and 231 struct types, unchanged), and the output hash is the same. The byte
  difference is in the type section's order: the arm's row is now found by type, earlier.
- `scripts/gate.sh`: all 23 rows pass. That includes the dead-export budget, with the five
  spelling helpers deleted.
- Render-parse: unchanged at 2 parses. `nonNulBaseOf` keeps 6 callers:
  - `internNonLowerableFieldShapesTy` and `elemNameIsDeclared` ×2: lane E;
  - `rlElemStructRow` and `fieldRefElemName`: lane F;
  - `shapeFieldElemName`'s FC_STRUCT arm: lane F's `sFieldElemName` re-key.
