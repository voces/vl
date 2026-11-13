# Step 7 D6: a closure-result list field's struct element is told from a union arm by its type, 2026-11-13

This is lane E's item 1 from closing census 5's D6 column. `structElemArrayLowerable` decides
whether a ref-list field of a closure-result record lowers:

- a declared plain struct element does;
- a union arm's element does not, because it rides the variant machinery;
- an inline shape element lowers when `funcTypeShapeLowerable` admits it.

#7641 had already moved its element to the type. But it then turned that type back into a name
(`tyToNominalName`, else the walk key) and asked three questions of the name: `nameIsShapeOpen`,
`nameIsStructDecl` and `variantIndexOf`.

## Changed

The element type, past `| null`, decides every case:

| element type | answer |
| --- | --- |
| not a record | false |
| a union arm (`exactArmRowOfTy`) | false |
| a declared record (its nominal name is a `cUserTypes` entry) | true |
| any other record | `funcTypeShapeLowerable(eTy)` |

The `nameIsStructDecl` and `variantIndexOf` imports leave `emit_shape_intern`. None of lane B's
`w324-*` branches touches this function.

## Probe

A scratch compiler, never refreshed into a seed, computed the old and new answers at every reach
on master `20722318`, over 24,204 programs. A disagreement raised a distinctive `emitFail`. There
were **0** disagreements. The site is reached in 12 programs, according to the probe of
`2026-11-12-step7-lane-e-struct-elem-lowerable-ty.md`.

## Proof

- Refresh ×2: fixpoint.
- Sweep with fixpoint seeds on both sides: 24,204 same, 0 bytes-only movers, 0 output movers,
  0 `runs → not-runs`, 0 new compiler traps.
- `scripts/gate.sh`: all 23 rows pass, on the branch and on the tree merged with master `79de107d` (D's #7726).
