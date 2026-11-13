# Step 7: the variant field identity spelling column is deleted, 2026-11-13

Lane E. Each variant field row carried a render of its field's type: `armStageTyText` while the
arms were staged, `sFieldTyText` once they adopted struct rows, read through `armFieldTyText()`.
`collectShapeVariantFields` filled it with `variantFieldIdText(tyToNominalName(fldTy), fldTy)`;
the declared-arm path filled it with `variantFieldIdText(tyNameOf(fdType), …)`.

Its readers have been converted to the field's arena type:

- #7795: the plain-`string` tests (`litFieldRowIsPlainString`, `sharedFieldLitArmKind`) and the
  `variantRowsTagEqual` fallback;
- #7802: the four positional compares, through `variantRowFieldTysSame`;
- lane G's #7812: `sharedFieldArmAtomKind`'s `valueAtomKind`.

After #7812 the column was written, copied, padded and reset, but never read to decide anything.

## Changed

Deleted:

- the column, its staged twin and `armFieldTyText()` (emit_state);
- its copies in `rowMintFrom`, `armFactsPad`, adoption and `armFieldRowMove` (emit_union_atoms);
- `pushFieldRow`'s `tyText` parameter, `variantFieldIdText`, and both renders that fed it
  (emit_collect).

The declared-arm path's `ftxt` had lost its last other use, the refusal message, in an earlier
master change, so it goes too.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides, master `31f92f78` against the candidate: 24,222 same,
  0 bytes-only movers, 0 output movers, 0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all rows pass.
- Render-parse census: the `tyToNominalName` render in `collectShapeVariantFields` leaves, so
  `ty-render` goes from 96 to 95. The declared path's `tyNameOf` was not a graded entry.
