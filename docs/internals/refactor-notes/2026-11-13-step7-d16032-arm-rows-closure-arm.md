# Step 7 (lane D, D16032): the arm-row and closure-arm readers read rows, 2026-11-13

After #7887, a re-map probed each site that still looks a union's row up by its `unNames` label.
The probe compared the label's row with the row the site already holds, over the
24,170-record population. The coordinator split the readers. This note covers lane D's two;
lane G keeps the `msFreeAtoms` readers, and lane H keeps `unionNameOfExpr`'s `??` arm.

- **`unionArmRowsOfTy`** (wasmEmit) has a fallback that runs when `armRowsOfUnionTy` misses. It
  read `unionArmsOfTy(unionName, unionTy)`. That label found a row the type did not in 94
  programs (116 decisions), and in every one `unionTy` was a TyNullable with no member set of its
  own: the hole binding's scalar `T | null` box. The fallback now reads the arms of
  `nulScalarBoxRowOf(unionTy)`, the row #7877 gave that box; a miss fails loudly. Its callers
  `emitUnionWideArmBox`, `wideRetagPairs`, `emitUnionWideRetag` and `emitUnionArmValueBox` drop
  their `unionName` parameter.
- **`unionClosureArmTyOfTy`** (emit_union_atoms) reads `unionArmTysOfRow(unRowOfTyKey(ty))`,
  else a row-less type's member types (`unionTyMemberTys`), and takes no name. The label and
  the key named the same row in 58 programs, and only the key named one in 1 program.
  `unionArmTysOfTy`, `unionRowArmsInto`, `unionArmTys` and `unionTyArms` lose their last caller
  and are deleted (agreed with lane G).

## Measurement

| site | label vs held row | programs (decisions) |
| --- | --- | --- |
| `unionArmRowsOfTy` fallback | label only | 94 (116) |
| `unionClosureArmTyOfTy` | same / key only | 58 (140) / 1 (3) |
| `unionArmTysOfTy` name leg | reached by none | 0 |

**Byte comparison** of master `25a28d6` against this change on the fixpoint seed:
- the 153 programs that reach either site: 153 SAME;
- 548 programs (those 153 plus a sample from the population): 472 SAME, 76 refused alike, 0 DIFF.
