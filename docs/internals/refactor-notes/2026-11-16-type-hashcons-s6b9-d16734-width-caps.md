# Type hash-cons stage 6b: D16734, three depth limits on the nested-width path (lane H), 2026-11-16

D16734 is clause 1. A record wider than its destination only at a field seven or more levels down
is check-clean and built an invalid module. The 6b depth grid (`2026-11-16-type-hashcons-s6b7-deep-grid.md`)
did not reach it: no grid shape drops a field. A probe of a width drop at each depth found it.

## Localisation

Each step deepened a subset of caps in a scratch seed and graded the witness at depth 7.

1. Deepening every exhaustion cap fixes it. Bisected by file, then by function: `tyReachesHole`
   (`tyquery.vl`), whose exhausted budget answers "reaches a hole".
2. Bisected over its 74 call sites, raising one site's starting depth at a time:
   `objShapeAdapterless` (`check_fit_rules.vl`), `tyReachesHole(dst, 8)` in the guard "a pair
   reaching an inference hole is not a pair of shapes yet". That site alone fixes depth 7.
3. Depth 8 and deeper also needed `objSrcReachesHoleFor`'s paired budget (8, then
   `tyReachesHole(ft, 7)`) and `recWidthFit`'s budget (8, answering "does not fit") behind
   `recNestedWidthPair` (`check_obj_shape.vl`). With all three lifted, depths 6 to 14 run.

Ruled out: raising every `recordRepTyAdopt` budget to 64, and lane AE4's D16731/D16732 branch.

## The close

- `tyHoldsHole` (`tyquery.vl`) is `tyReachesHole`'s walk with a path of the unions and records
  entered (`tyPathCycles`, `tyPathWith`) in place of the budget. The guard asks it.
- `objSrcReachesHoleFor` and `recWidthFit` walk a path of the source records. A cycle back to a
  record still on the path keeps the old exhausted answer: the hole walk's for the first, 0 for
  the second.
- `tyReachesHole` keeps its budget at its other 73 call sites. Removing it waits on
  `rcwCovsGo`'s `depth > 12` and `elabSlotClimb`'s path cap (lane SLOT), without which
  `deepnest_fnone_d12` stops running. That is the next 6b step.

`recNestedWidthPair` has four callers (`check_demands`, `check_fit_rules`, `check_rec_drop`,
`check_rec_rows`). Each now answers past eight levels too.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint on the branch and on master `7de99c68a`; every refresh exits 0 |
| witness | depths 1 to 14 print `1` (master: invalid module from depth 7) |
| identity | 2,827 of 2,827 files byte-identical (the 6b sample, with every recursive or cyclic corpus file) |
| probes | the eight recursive-type programs terminate and print the same |
| depth grid | 240 of 240 run on both seeds |
| distilled | no cell changed class |
