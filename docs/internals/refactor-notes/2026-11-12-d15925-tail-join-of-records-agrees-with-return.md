# D15925, the record half: a tail value `if` of records of functions agrees with its `return` spelling, 2026-11-12

D15925 has two spellings. This change makes the record one run: a function whose tail is a value
`if` (or `match`) of records holding un-annotated functions, called through its result. That
spelling was refused at emit (`cannot take the generic function … as a value`) while
`return if …` ran. The row stays open for the list spelling, which `return if` shares.

## Mechanism

Probes, on scratch compilers never refreshed into a seed:

- **At emit.** `elabRetTaggedJoinAt` found the result holding a tagged set for `return if`,
  and none for the tail.
- **In the tag plan.** The plan for the join's set first failed at the body-tail holder
  (`ftHoldCtxOk`). The tail's type and the inferred result were equal copies, not one arena
  index. With that passing, it failed at the arm literal's field (`ftCtxOk`): the literal's rep
  had been adopted at a record of closed function fields.
- **The adoption.** A trap in a `--names` build showed it came from `pinSolve` adopting
  `recAdSetLit`. That list is filled by `holeRecAdopt` from `holeRecSrcsOf`, which followed the
  call into the tail `if`'s arm literals. For `return if`, the returned value is the `if`
  itself, so `holeRecSrcsOf` declines it, and no record is built at the call.

## What changed

- `holeCallTailIsJoin` (`check_calls.vl`) declines a call whose callee's body ends in a value
  `if` or `match`, as a returned `if` is declined.
- `ftHoldCtxOk`'s body-tail arm (`check_fn_tag.vl`) compares the tail's type with the inferred
  result by `tySame`.

## Witnesses

The fixture `tests/cases/closures/tail-value-join-of-records-of-fn-fields-called-through-result.vl`
covers:

- the record tail `if`;
- two results;
- a bound result;
- a tail `match`.

Each maker has its own functions. One function shared by two makers fails on master in the
`return` spelling too, with `this call runs functions that return different types`, which is
another gap.

## Measurement

This can move outcomes, so the sweep is CI's under the `sweep` label.
