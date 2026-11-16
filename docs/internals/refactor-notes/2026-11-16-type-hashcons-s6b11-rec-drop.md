# Type hash-cons stage 6b: the dropped-field walks without a depth, and D16735 (lane H), 2026-11-16

D16734's close (`2026-11-16-type-hashcons-s6b9-d16734-width-caps.md`) left one spelling loud: a
record literal handed through a function value whose parameter drops a field eight or more levels
down. Lane WIDTH handed the dropped-field walks to 6b.

## The walks

- `recDropPlans` and `recDropApply` (`check_rec_drop.vl`) walk the literal's syntax tree, which
  cannot cycle, so they lose their `depth` outright.
- `recDropFitsAt` and `recDropLandingAt` walk record type pairs, which can, so they take a path of
  the source records (`tyPathCycles`, `tyPathWith`). A cycle keeps the old exhausted answer, `false`.

Neither moves the witness. They were budgets of eight on walks the program never exhausted.

## D16735

A cap bisection on this tree named `tyReachesHole` again, and the call-site bisection named
`fieldStorageEq` (`check_ty_relate.vl`): a pair that reaches a hole is taken as stored alike, and
a record eight levels deep exhausts `tyReachesHole(a, 8)`. The differing leaf read as stored alike,
the dropped-field plan found nothing to land, and the delivery was refused. The guard now asks
`tyHoldsHole`. `fieldStorageEq` keeps its own `REC_STORE_DEPTH` budget: lifting it alone did not
move the witness, and its 80 callers are their own batch.

`tyHoldsHole` (added by D16734's close) walked a path of the rows it was inside. On a diamond, a
record whose fields share a record type, a path walk visits the shared subtree once per route, so
its cost doubles per level. `tests/vl_scaling_shape_test.ts` ("diamond record depth") caught it
once `fieldStorageEq` asked on every field pair: a fuel ratio of 5.4 against a bar of 4.45. An
existence query needs no path (6b-5's rule), so `tyHoldsHole` now keeps a visited list of the union
and record rows it has entered. A row met again, on a cycle or beside a shared subtree, adds
nothing its first visit did not, because a hole under it would already have answered the query.
The scaling suite passes (90 of 90).

## Instrument

`scripts/capability-probes/matrix/record-nested-width-deep.matrix.vl` is
`record-nested-width-existing` with the wider record nine records down, plus a function-value cell
written fresh (that template has none). `function_value` (an existing record through a function
value) is refused at every depth, depth one included, so it measures no depth limit.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint on the branch and on master `4e1885672`; every refresh exits 0 |
| witness | depths 1 to 14 print `1` (master: refused from depth 8) |
| deep matrix | 46 of 48 graded run (master 44): `function_value_literal` moves to runs; 0 runs -> not-runs, 0 silent, 0 traps |
| identity | 2,827 of 2,827 files byte-identical |
| probes | the eight recursive-type programs terminate and print the same |
| depth grid | 240 of 240 run |
| distilled | no cell changed class |
