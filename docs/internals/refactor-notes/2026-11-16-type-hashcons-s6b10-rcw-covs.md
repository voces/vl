# Type hash-cons stage 6b: the covariance walk without a depth (lane H), 2026-11-16

`rcwCovs` (`check_fit_rules.vl`) finds the slots a record delivery widens. It already keeps the
(source, destination) pairs it is inside (`rcwCovA`, `rcwCovB`), and a pair met again on its cycle
is decided by `rcwCovsRevisit`. So its `depth > 12` cap, which failed closed by counting everything
below as widened, bounded nothing the pair stack did not. Its union step `rcwIntoUnion` had its own
`depth > 12` exit. Union members are not reached through the pair stack, so it takes a path of the
unions entered (`tyPathCycles`, `tyPathWith`), a cycle answering what the exhausted cap did: nothing.

`depth` leaves `rcwCovs`, `rcwCovsGo`, `rcwIntoUnion` and their callers (`check_calls.vl` once).

Why it matters: with `tyReachesHole`'s budget lifted, `deepnest_fnone_d12` (a function field
thirteen records down) reaches this walk, and the fail-closed cap refused it. With this change and
lane SLOT's `elabSlotClimb` fix (#8616), it runs. Those two are what `tyReachesHole`'s budget waits on.

| reading | value |
|---|---|
| seed | fixpoint on the branch and on master `e056e7cea`; every refresh exits 0 |
| identity | 2,827 of 2,827 files byte-identical |
| probes | the eight recursive-type programs terminate and print the same |
| depth grid | 240 of 240 run |
| distilled | no cell changed class |
| guest fuel, L2 | 93,779,088,115 on master, 93,782,738,212 on the branch (+0.004%) |
