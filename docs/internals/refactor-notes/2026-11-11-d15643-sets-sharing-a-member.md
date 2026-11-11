# D15643: choices of sets that share a member are decided together, 2026-11-11

Clause-2 close. A clause-1 trap closes with it: the list spelling was check-clean and trapped.
Base is master `09b00b57`.

## What was wrong

`pickA` holds `if c { {f: id1} } else { {f: id2} }` (set `{id1, id2}`). `pickB` holds
`if c { {f: id1} } else { {f: dbl} }` (set `{id1, dbl}`). Each is handed to a hole callee. Both
sets are decided late, from the elaboration's facts. A probe build logged `ftTry` and every
`ftPlan`/`ftScan` refusal. Each two-member set planned, then took the singleton `{id1}` as a
sub-need. The singleton's plan refused at `ftScan`'s holder check (`ftHoldCtxOk`): its other
literal is an arm's tail in the other choice's join. That join's set was neither the set being
decided nor in `ftAssume`, so `ftHoldsDecided` said no. Neither set was tagged, the field calls
found no closure of their signature (emit reject), and the list spelling built `id1`/`id2`/`dbl`
with no signature at all, so `gl`'s indirect call trapped.

## The fix

`ftJoinWiderNeed` (check_fn_tag.vl), one more arm of `ftHoldCtxOk`'s block case. An arm tail
whose join holds a wider set not yet decided pushes that set onto `ftSubNeed`, so the plans run
together. `ftTry` commits only if every plan holds, so a failure still tags nothing. This is safe
because a tagged value's id is its member's declaration (`fnTagLeafId`), the same in every set. The
shared literal hands on one id whichever superset reads it.

## Graded

Master → now: the repro and the record spelling at one type, emit reject → runs; the list
spelling, trap → runs; three choices chained by shared members, `match`, annotated `c`, both arms
run, beside `keep(id1)` at a closed type, emit reject or trap → runs. Disjoint sets and identical
sets run as before. `--names` builds dispatch with `i32.eq` and have no `call_indirect`/`call_ref`.
The one left beside `keep` is `keep`'s own. Not reached: the choice written as the argument (emit
reject on master too), and [D15658](../inventory/D15658.md), a set beside an annotated member,
which traps without any overlap.

[D15337](../inventory/D15337.md) closes with this change too. There, a sub-set's arm literal sat
in a join typed at the wider set, and it was refused the same way. It now runs `2` `2.5` `2.5` and dispatches by `i32.eq`.
