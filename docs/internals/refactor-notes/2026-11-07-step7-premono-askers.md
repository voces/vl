# Step 7: the pre-monomorphize askers, and the first `computeRetInference` run deleted

Measured 2026-11-07 on master `fa202cbb`, 4-core box, over the sweep population (23,613
programs, `scripts/sweep.vl -- list`).

## Census by pass

`scripts/classifier-census.vl -- --callers` names each ask's *immediate* caller, which is a
helper (`structIndexOfIdentExpr`, `exprString`, ...), not the pass that runs it. It also builds
its probe from the CURRENT source, so it cannot A/B two seeds. For this note a scratch probe
(nothing of it is committed) keyed each classifier entry by the emit pass running it:
`runEmitPass` stores the pass name, and `clsCensusEnter` writes it in place of the site number.
The base total matches the census's own, 1,174,327 pre-monomorphize asks.

| pass | pre asks | classifiers reached |
| --- | --- | --- |
| `computeRetInference` (first run) | 731,223 | 96 |
| `dispatchRewrite` | 296,758 | 75 |
| `collectA` | 136,501 | 52 |
| `monomorphize` (during) | 8,617 | 66 |
| `collectU` / `collectS` / `scanArrLitCommit` | 1,124 / 98 / 6 | 2 / 1 / 2 |

`synthNulListRetAnns`, `synthRetAnnots`, `captureBoxRewrite` and `letInitCellKind`'s pre-mono
calls are not passes of their own here: `letInitCellKind` is reached from the three passes above.

## The first run had no reader

The ruling: a template is not an instance, so a template's return kind asked before mono is a
per-instance fact asked at the wrong place. Four trials, each a fixpoint seed swept against base:

| trial | pre-mono `computeRetInference` asks | sweep vs base |
| --- | --- | --- |
| closed functions (no type parameter, no type variable in the checked type) read their columns off the recorded result | 489,574 | 23,613 same |
| and the walk skipped for open functions (templates, hole lambdas) | 23,476 | 23,613 same |
| and no walk at all before mono | (epilogue only) | 23,613 same |
| the pass not run | 0 | 23,613 same |

Every program compiles to the same bytes, and so does the compiler's own source (6,473,613 bytes
from either seed). `buildFnMap#2` re-seeds every column after mono and `computeRetInference#2`
settles them, so `dispatchRewrite`, `synthNulListRetAnns` and `monomorphize` read only columns
that never decide their output. This PR deletes the pass row; `criAfterMono` goes with it, since
the run left is always the post-mono one. The column shadow's `pre seed`/`pre settled` points go
too.

## After

| pass | pre asks |
| --- | --- |
| `dispatchRewrite` | 296,879 |
| `collectA` | 136,501 |
| `monomorphize` (during) | 8,614 |
| other | 1,228 |
| **total** | **443,222** (−731,105, −62%) |

Classifier phase classes: post-only 6 → 19, both 98 → 85, pre-only 1. The 13 that became
post-only (pre-mono asks in base): `retCapturedMapShape` 46,225, `cloRetValSlot` 359,
`identBindingNulStrList` 294, `mfStructResultRowName` 261, `cloRetIsStructRow` 251,
`callIsMapFilter` 182, `letIsNulString` 122, `ifExprRefKindOf` 106, `forInPairElemKind` 56,
`mapValElemKind` 49, `readCellKind` 36, `forInVarIsLitAtom` 21, `moduleCopySigKey` 2.

## Proof

| check | result |
| --- | --- |
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,473,613 → 6,473,358 (−255), both fixpoints |
| `scripts/sweep.vl` diff, 23,613 cells | 23,613 same, 0 bytes-only, 0 movers, 0 `runs → not-runs` |
