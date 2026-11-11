# Step 7 slot layer: three map-value name readers read the type, and `mapNameKeyKind` is deleted, 2026-11-11

w318's classifier census named three name readers in the map-value bank: `mapAnnShape`,
`mapNameKeyKind` and `scalarListRepOfName`. Base is master `1d517770` (#7216).

## Measurement

A probe compiler was built into scratch and swept over the whole population (`scripts/sweep.vl`,
23,909 programs). It compared the spelling's answer with the type's at each site:

- **The eight `mapNameKeyKind` sites**, against `tyMapKeyKindSpan` of the type the site holds.
  Where a site held no type, it marked a spelling that answered a non-string key.
- **`nulRefMapValInnerOfTy`'s list test** (`scalarListRepOfName(inner)`), against the inner
  type's rep: a non-null list kind other than `reflist`.

It fired **0** times.

**The probe was checked against a control.** A variant that fired on any i32-key answer failed
at the variant-row recorder (`collect`'s shape-text row) on a union arm with a `{[i32]: string}`
field, and the probe seed ran that program.

## What changed

- **`mapAnnShape`** takes its key kind from the node's recorded type alone
  (`nodeTyMapKeyKindSpan`). The spelling fallback for a node with no type never answered a
  non-string key, and the spelling it cut (`mn`) is deleted.
- **The key-column recorders read the field's type** (`tyMapKeyKindSpan`):
  - `collect`'s variant shape-text row;
  - `emit_shape_intern`'s four rows: the field row, the alias row, the dedup keys and the
    generic-alias row.
- **`mvShapeOfMapHeldTy` drops its `mapName` parameter** (10 callers). The held map's own key
  kind was already its answer wherever a spelling was passed.
- **`rlMintMapKey` drops its spelling floor.** A map element with no map type answers the string
  key.
- **`nulRefMapValInnerOfTy`'s list arm** reads `repOfTy(innerTy).rdKind`.
- **Deleted, now with no readers:** `mapNameKeyKind` (`emit_base`) and `nameIsI64HashedKey`
  (`check_ty_rep`).

## The floors that stay

`scalarListRepOfName` keeps three callers:

- **Two in `mvValKindOfSpelling`.** This is the spelling classifier for a caller with no type in
  hand, the residue #7134 named. It goes when its two callers hold the field's type.
- **One in the field-code ladder** (`emit_shape_rows`, the list arm of the spelling-side field
  code). That ladder belongs to lane w314.

## Proof

<!-- gates -->

Under the standing velocity instruction, CI's `sweep` job re-proves identity on the merged tree.
