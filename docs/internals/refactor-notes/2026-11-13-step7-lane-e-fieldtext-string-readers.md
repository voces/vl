# Step 7: the variant field-text string readers ask the field's type, 2026-11-13

Lane E. A union variant's field rows carry an identity text column (`armFieldTyText`). That column
is a render of the field's type. Two readers compared it to `"string"`. A third read it to compare
two rows when a field had no arena type.

## Changed

- `litFieldRowIsPlainString` (emit_variant_sig) and `sharedFieldLitArmKind` (emit_obj_lit_fits)
  now read the field's arena type through `tyIsPlainString`: the primitive `string`, with no
  nominal brand. They look the field up by name in the variant's record type (`uVarTyIx`).
- `variantRowsTagEqual` compared the text when either row had no arena type. That fallback now
  sits behind a loud floor (`VARIANT_FIELD_UNTYPED_MSG`), since variant rows are minted from record
  types (D16030). `variantFieldBaseKey` is deleted.

## Probe

The probe used a scratch compiler, never refreshed into a seed. At each reader it compared the
old text answer with the typed answer, and it put a distinctive `emitFail` on the fallback. It was
drained once after `emitProgramRun`, over the sweep's population. A control fired.

| Site | Programs reaching it | Disagreements |
|---|---|---|
| `litFieldRowIsPlainString` | 9 | 0 |
| obj_lit `== "string"` | 179 | 0 |
| `variantRowsTagEqual` text fallback | 0 | — |

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `1ba9fd48` against the candidate: 24,217 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all rows pass.
- Render-parse census: emit_variant_sig's two `ty-render-display` entries (the `tyToStr` renders
  in `variantFieldBaseKey`) leave, and the file drops out of the baseline. Compiler total
  `ty-render-display` goes from 44 to 42.

## Left on the text column

These are positional compares of `armFieldTyText` (lane E): the emit_collect variant twin test,
emit_map_twins, emit_shape_rows and wasmEmit. Once they and lane G's `valueAtomKind` reader in
emit_obj_lit_fits read types, the `tyToNominalName` render in `collectShapeVariantFields` can go.
