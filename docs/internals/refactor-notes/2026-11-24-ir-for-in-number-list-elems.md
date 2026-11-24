# IR: a list walk over `f64` lists, `i64` lists or nullable byte lists, 2026-11-24

Lane IR-N6, the classes `for in element f64list`, `for in element i64list` and
`for in element nulu8list` (the queue's ack; stacked on N1's #9892, which moves `nulbool` and `f32`
on the same two lines of `forInElemPlain`). Population, all tests/cases:
`arrays/nested-array-for-in.vl`, `generics/generic-nested-list-literal-pin.vl`,
`maps/forin-list-valued-values.vl` (`f64list` and `i64list`), `maps/u8-list-literal-into-map-value.vl`
(a `nulu8list` start). None in the corpus or the capability probes.

## The mechanism

`forInPlainWhy` refuses a list walk whose element kind `forInElemPlain` (wasmEmit) does not list.
The three kinds move to its `true` arm; no other code changes. The IR's list walk already binds the
element at `ln.rlsElem`, which for these lists is the inner list's own rep.

Who reads it (`git grep`): `forInElemPlain` only from `forInPlainWhy`, and `forInPlainWhy` only from
the IR builder (`forInStmt`). Legacy's `emitForInStmt` reads neither, so legacy's bytes cannot move;
the legacy A/B below is empty.

## Legacy tails the IR calls

None new.

## Readings (fixpoint seeds on both sides, base #9892's head 4d4ca865)

READINGS

## Witnesses and the position sweep (Q58)

`tests/cases/lists/for-in-number-list-elements.vl` walks `f64[][]` (an empty inner list), `i64[][]`
(summed), `(u8[] | null)[]` (a `null` and an empty one), and an outer list pushed onto during its
walk (the pushed row is read on the next step); it prints `2 0 1 43 2 -1 0 2 1` under both seeds and
claimless, the base refusing all 4 functions, the candidate covering 4.

`scripts/capability-probes/matrix/list-walk-number-list-element.matrix.vl`: each position is a cell
delivering the walked inner list from the loop body (argument, nested argument, concat, `let`, `if`
arm, record field, `return`), plus `i64` and nullable byte cells. 66 of 66 graded cells RUN before and
after; under `VL_IR_SHADOW=6` the candidate covers 544 = verified 544 = matched 544 and every start
(68), where the base left 68 functions and 18 starts at the three classes; `ir-identity.sh
--claimless` over them is identical 66, differ 0.

Shadow row `tests/ir-shadow-rows/for-in-number-list-elements.vl` (base 0 of 3, candidate 3 of 3).

Legacy lines deleted: 0. Moved to `@ir`: 0.
