# IR: a field store's value through legacy's one value arm, 2026-11-21

`fieldStore` took only a value `fieldStoreValuePlain` called plain. Every other value missed as
`field store value` (134 corpus functions, 76 alone). A plain value whose rep was not the field's
missed as `field store coercion` (49).

## The change

- `fieldStoreValueArmOf` (struct row) and `variantFieldStoreValueArmOf` (variant) in `wasmEmit`
  name the arm the store writes: `plain`, `box`, `f64` / `i64` / `f32`, `atomToStr`, `strValue`,
  `nulnone` or `armDelivery`. `emitStructFieldStoreValue` and `emitVariantFieldStoreVal` now
  match on that arm, so legacy and the IR read one decision. The two `*ValuePlain` predicates are
  no longer exported. The kinds the plain check always answers plain map to `unencodable`, which
  legacy refuses (`fieldStorePlainMissed`) and the builder misses, so a disagreement stays loud.
- The builder delivers the value at the field's rep through `deliver`. That is the existing box
  plan (`emitUnionBoxOwed`), widening (`emitWidened`), atom decode (`emitAtomToStr`, which
  `emitStrValue` writes for an atom), and, under #9301's `narrowedArmNeedsUnbox` gate, the
  nullable record's value. A plain value delivered this way closes `field store coercion`: a
  string into `string | null` and an atom into `K | null` are the value as it is.
- `fieldStoreRepFits` requires the receiver's field rep to be the slot the arm writes. A generic
  instance's receiver type can read a field as `i32` that its row stores as a union box; that store
  stays legacy's (`field store row rep`). `ir-identity --cases` found it in
  `soundness/field-read-off-wider-built-literal-binding-to-param-runs.vl`, and the row is pinned by
  a shadow-row file.
- Named misses: `field store value <arm>` for `nulnone`, `field store arm unbox`,
  `field store box from a box` and `field store row rep`.

## Readings (merge-base `f96b16fc8`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 41,969 | 42,045 (+76) |
| corpus `field store value` (alone) | 134 (76) | 0 |
| corpus `field store coercion` | 49 | 0 |
| self-compile functions with no blocker | 19,140 | 19,140 |

The self-compile's one function in each class now stops at another blocker.

Legacy lines deleted: 0. Moved to `@ir`: 0.
