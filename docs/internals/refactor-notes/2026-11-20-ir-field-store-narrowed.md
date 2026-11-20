# IR: a field store through a box narrowed to one variant (2026-11-20)

`field store narrowVariant` blocked 59 self-compile functions alone: `o.f = v` where `o` is a union
box local narrowed to one variant (`fieldStoreArmOf` `narrowVariant`). Legacy writes the box, its
payload cast to the variant (`struct.get $uBox 1; ref.cast`), the value, and the variant's
`struct.set` (`emitFieldStoreNarrowed`).

## The change
- **The decision.** `fieldStoreNarrowedAt(lhsIx, fnIx)` names the variant and field legacy's
  narrowed store writes, which `emitFieldStoreNarrowed` now asks; it is `fieldStoreVariantAt`'s
  twin for a narrowed box receiver.
- **The IR.** The field store takes the `narrowVariant` arm beside `variantParam`. Its receiver is
  the narrowed read `irBExpr` already builds for a box local at a variant's record rep
  (`RBoxNarrow`: the box, then `narrowedVariantTail`, the same cast); its value passes
  `fieldStoreVariantValuePlain`, and the lowering writes `fieldStoreVariantTail`, as for a
  variant receiver.

## Measured on fixpoint seeds: master `e26a31b8d` against this branch

| | master | this branch |
|---|---|---|
| self-compile functions claimed | 17,271 | 17,324 |
| self-compile `field store narrowVariant`, alone | 59 | 0 |
| distilled functions claimed (`--claims`), all matched armed | 39,259 | 39,259 |

- **`ir-identity.sh`:** plain and `--names`, 9,037 identical, 0 differ, self-compile identical.
  `--cases`: 7,516 identical, 0 differ.
- **Mode 3:** cells and run cases byte-identical, and the self-compile identical.
- **L2 fuel**, same box against master's seed: 101,348,803,771 → 101,333,106,484 (−0.02%).
- **Lines:** +24 / −8 in `compiler/`.

## What is left
- The narrowed field read `member box` (8 self-compile alone) is the read twin of this store.
