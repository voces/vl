# Step 7: the return columns graded against the recorded result

Measured 2026-11-07 on master `f51b7c9c`, 4-core box. Population: the shadow-only sweep of
`2026-11-07-step7-void-from-recorded.md` (19,355 files, 13,513 compile with no imports staged).

## The column shadow (`fnColShadowArm` / `fnColShadowRun`, new)

The kind shadow grades the lowered `$fnsig` token, which is what a reader of `fRetKind` builds,
not the column. This one grades the columns `computeRetInference` writes (`fRetKind`,
`fRetStructIdx`, `fRetRArrElem`, `fRetBool`, `fRetLitAtom`) against `repOfTy` of
`fnRecordedRetTy`, only for un-annotated valued functions (all the pass reads), at four points:
before and after each of its two runs. `post seed` is the column as `buildFnMap#2` left it.

| point | functions | every column agrees |
|---|---|---|
| pre seed / pre settled | 18,111 | 9,397 settled |
| post seed / post settled | 2,994 | 2,348 settled |

Post-mono the population is small because `synthRecordedRetAnnots` annotates most functions
before `buildFnMap#2`, which then seeds from the annotation. Post settled, outside agree:

| class | functions | witness | grade |
|---|---|---|---|
| slot struct/variant/nulvariant: recorded names no row, column does | 497 | `distilled/named/d1476_annotated_twin.vl` `__lambda_0` | reader gap: `repSlotOfTy` answers only a declared row; the token reader finds the anonymous row |
| kind closure vs i32 | 83 | `distilled/named/d15110_returned_lam.vl` `a` | vocabulary: the column keeps `i32` for a closure, the token agrees |
| slot struct: rows differ | 24 | `distilled/named/d15247_i64_flat_copy.vl` `mk` | not graded |
| no result recorded | 17 | the void note's 17 | missing fact: open result in a generic body |
| rep uncovered, no kind | 13 | `tests/cases/arrays/u8-list-map-positions.vl` `__lambda_0` | rep-layer gap: `u8` storage result |
| atom / elem / variant vs struct / str vs i32 | 12 | `tests/cases/closures/captured-litunion-assign.vl` `armWrite` | not graded |

Pre-mono, 6,902 functions record a result the rep layer cannot cover: an open result (a lambda
with a hole parameter, `distilled/named/bundle_bare_return_if.vl` `__lambda_0`). Nothing closes
that type until `monomorphize`, so **the first `computeRetInference` run cannot be replaced by
reading the recorded result**. `dispatchRewrite`, `synthNulListRetAnns`, `monomorphize` and the
passes between read its columns.

## The kind shadow's seven classes, graded (81 functions)

| class | n | grade |
|---|---|---|
| recorded result has no token | 39 | missing fact: a record or list of records built at a call's row (D15203, D15207, D15293 families). Keep the old answer. |
| recorded `>c`, lowered `>s0;` | 22 | reader gap: the instance returns its bundle parameter. `monomorphize` notes it (`bundleRetParamNote`) and the bundle record is `bundleRecordTyOf`. Closable in the reader. |
| no result recorded | 17 | missing fact, as above. Keep the old answer. |
| recorded `>S`, lowered `>i` | 1 | missing fact: the alias. `return (g = e)` over a `K` global records the un-named literal union, which reps as a string. The emitter returns the target cell's kind. |
| row `>Z`/`>M-4;`, `>m-1;`/`>M-1;`, `>m-6;`/`>M-6;` | 3 | not graded: one function each |

## What this leaves for the switch

Post-mono, 2,348 of 2,994 functions (78.4%) could read their columns from the recorded result
today. To get the rest: the slot reader has to find anonymous rows (497), the column vocabulary
for closures has to be settled (83), and 24 row disagreements have to be graded. Pre-mono needs
a decision: either the pre-mono readers stop asking for a kind, or the pass stays until the
elaboration closes results before `monomorphize`.

## Proof (shadow only; nothing the emitter reads changes)

| check | result |
|---|---|
| fixpoint | two `refresh-compiler.sh` runs byte-identical |
| seed size | 6,441,037 → 6,447,508 (+6,471, +0.10%), both fixpoints |
| `scripts/sweep.vl` diff, 23,610 cells | 23,610 same, 0 movers, 0 `runs → not-runs` |
