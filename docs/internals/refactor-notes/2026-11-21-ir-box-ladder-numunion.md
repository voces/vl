# IR: a numeric union passes into a union box (2026-11-21, lane IR-N2)

`box ladder` was the largest unowned class in the corpus (251 functions at 4c186c33). A census
that tags each of the box plan's (`holeBoxPlanOf`) ladder exits with its rung split it as follows.
The counts are functions over the distilled corpus and `tests/cases` with the ladder as their only
blocker.

| rung | functions |
|---|---:|
| a numeric union value (`holePassPlanOf`, `nodeIsNumUnion`) | 200 |
| a value with no primitive type: a closure (63), a map (42), a list (14), a union (11) | 132 |
| the other rungs together | about 100 |

187 of the 200 numeric-union functions are the distilled `named/nj2_*` grid, for example
`kind((q ?? (r ?? b)))` with an `f32 | f64` join delivered into a generic's box.

## The change

Legacy reaches a numeric union through `emitUnionCoerceUnder`. There `emitNumUnionRebox` re-boxes
it member by member only when every member stores at a kind the box holds and one stores at a
wider kind. Otherwise it returns 0, and the value passes as its box (`exprUnion` → `emitExpr`),
which is the plan's `pass`. The plan refused every numeric union. It now asks the same decision,
`numUnionReboxes` (`emit_plan_union.vl`), which `emitNumUnionRebox` also asks; `njKindOfTy` and
`njStoreKind` move beside `njMembersOf` for it. The predicate reads the checker's
map-delivery flag through `mapDeliveriesRecorded` (`emit_classify.vl`, which already imports it),
so the phase-state surface does not rise.

## Witness

`tests/cases/unions/numeric-union-box-passes-into-generic.vl`: an `f32 | f64` join and an
`i64 | i32` coalesce, each delivered into a generic's box. Row file
`tests/ir-shadow-rows/numeric-union-box-pass.vl`.

## Measured

See the PR body (fixpoint seeds on both sides, merge-base `5d2c2b81`).
