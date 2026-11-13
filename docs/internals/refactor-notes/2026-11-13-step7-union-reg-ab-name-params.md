# Step 7 L6 (lane G, cut 7c): two registry seams drop their spelling parameter, 2026-11-13

The base is master `8b8f3404`. `unionRowNameAB(site, name, ty)` and `isUNameKeyAB(site, name, ty)`
answer from the type alone (`unRowOfTyAB`). Their `name` reached nothing but the armed A/B
tally (`unABProbe(site, unRowOfName(name), …)`), and three of their five callers passed `""`.

## Changed

Both seams take `(site, ty)`. Their five callers lose one argument:

- `nodeJoinRowName` and `ifJoinUnionName` (emit_start_block)
- `registerInlineUnionGo` (emit_collect)
- `funcTypeShapeLowerable` (emit_shape_intern, lane E's file)
- `nulRefElemEmitName` (emit_shape_rows, lane F's file)

The armed tally no longer records a spelling row at these sites. No test or script reads it.
`unRowOfName` loses two callers.

## Proof

- **Seed:** fixpoint.
- **The full sweep:** CI's `sweep` label. Unarmed, the emitted program is unchanged, so the
  expectation is identity.
