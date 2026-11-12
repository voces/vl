# Step 7 L6 (lane G, cut 6b): three more `unionNameOfExpr` readers ask the type, 2026-11-12

The base is master `8a5b3217`, after cut 6a (#7675): the box-path union names taken from the box's type.

## The census

A probe compiler, built in the scratchpad and never refreshed into a seed, recorded the old answer
against the typed one at each site. It ran over the sweep list (24,170 programs).

| site | the old answer | the typed answer | calls | disagree |
| --- | --- | --- | --- | --- |
| `coalesceDefaultNullable`, last rung | `unionSetHasNullTy(unionNameOfExpr(d), ty)` | `msHasNull(msSetOfTy(ty))` | 6,323 | 0 |
| `exprUnionBin`, the non-map `??` rung | `unionNameOfExpr(e) != ""` | `repOfTy(ty).rdKind == "union"` | 13,148 | 0 |
| `emitPrintValueUnion`, an if-expression argument | `unionNameOfExpr(arg)` | `boxTyName(ty)` | 85 | 0 on the gate; 3 other spellings of a row the type names, which `boxDstName` already prefers |

## Changed

- `coalesceDefaultNullable` asks the default's member set whether it holds `null`.
- `exprUnionBin` asks the `??` node's rep whether it is the box.
- `emitPrintValueUnion` names an if-expression argument's box by its type (lane I handed this one
  back).

## Left

`unionNameOfExpr` keeps lane G's producer-internal callers (`letUnionNameOfGo`,
`unionNameRowOfExpr` and the `??` rung's own recursion) and `printUnionPlanCode`. Lane I's
refusal list shows that the print dispatch reaches member sets with no recorded atoms, so its
fallback stays until those sets are covered.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress (no runs lost), rep-fuzz (exact), check-filed-witnesses `--strict` (4,860 graded, 0 moved), late-demands (8, baseline 8),
  seed-size (+1.9%), and the comment, ladder, sentinel and scan budgets.
- **The full sweep:** CI's `sweep` label. Expected identity.
