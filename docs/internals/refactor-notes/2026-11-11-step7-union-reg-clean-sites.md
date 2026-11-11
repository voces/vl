# Step 7 L6: 18 typed registry lookups ask the canonical type key, 2026-11-11

The union registry census (`2026-11-11-step7-union-registry-census.md`, cut order item 1)
compared, at `unRowOfTyAB`, the row today's softened key finds (`unRowOfKey(ty)`, which renders
the type and keys the text) with the row the canonical type key finds (`unRowOfTyKey(ty)`). On 18
A/B sites the two gave the same answer in every program of the population. This PR switches those
sites to the canonical key.

The base is master `68fd81f7`, with a fixpoint seed on both sides.

## Changed

- **`unRowOfTyAB` reads `unRowOfTyKey`** at sites 2, 32, 34, 35, 36, 37, 39, 44, 67, 68, 80,
  83, 85, 90, 96, 97, 101 and 105 (`unSiteOnTyKey`). Every other typed site keeps the softened
  key.
- **The canonical key's text moves below the registry.** It goes into a new module,
  `emit_union_tykey_text.vl`: `utkTyKeyText`, `unRowOfTyKey`, the key-text interner and
  `unMemPeelAliasWrapper`. The registry can then ask it without an import cycle
  (`emit_union_tykey.vl` imports the registry). `TY_WALK_DEPTH` moves with the text, and
  `emit_ty_canon.vl` re-exports it. `emit_union_tykey.vl` re-exports `unRowOfTyKey`, and the
  registry re-exports `unMemPeelAliasWrapper`, so no other importer changes.

## The census reading behind the 18

Over the 18,394 programs that reach the end of emit, the switched sites' typed calls are all
"same row" or "neither finds a row". The largest are site 85 (`armVariantWithHeap`, 7,289 same),
site 80 (`monoAnnPin/listElem`, 29), sites 67 and 68 (`funcTypeShape/unionField` 112,
`nulCloMixedUnion/res` 41), and site 83 (`armVariantForStructExpr`, 153). Sites 32 to 39 and 44
(`registerInlineUnionAt`'s descents) are reached only with no row on either key.

## Proof

- **Byte sweep.** `sweep.vl record` over the whole population with the master fixpoint and with
  the candidate fixpoint: 23,873 of 23,873 are the same, with 0 bytes-only movers, 0 output movers
  and 0 runs → not-runs.
- **Locally:** refresh ×2 byte-identical, rep-fuzz (exact), lint-self (clean), seed-size (+0.4%),
  late-demands (6, the baseline), the comment, render-parse, dead-export, scan, ladder and sentinel
  budgets, the pin-helper budget test, cases_wasm 0–3 (7,422 passed), inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, `check-filed-witnesses --strict` on both inventories,
  and plumb-shape-cost.
