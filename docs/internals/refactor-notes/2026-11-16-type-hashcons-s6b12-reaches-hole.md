# Type hash-cons stage 6b: `tyReachesHole`'s budget goes (lane H), 2026-11-16

`tyReachesHole(ty, depth)` answered "reaches a hole" when its budget ran out (D4038's rule). That
truncated answer was behind three defects the 6b depth grid led to: D16734 (`objShapeAdapterless`),
D16735 (`fieldStorageEq`) and the emit refusal `deepnest_fnone_d12` was routed around. The first two
moved one consumer each onto `tyHoldsHole`, the same walk with no budget and a visited list of
union and record rows (`2026-11-16-type-hashcons-s6b9-d16734-width-caps.md`,
`2026-11-16-type-hashcons-s6b11-rec-drop.md`). The third needed `rcwCovsGo`'s cap
(`2026-11-16-type-hashcons-s6b10-rcw-covs.md`) and `elabSlotClimb`'s (lane SLOT, #8616) to go first.

With those in, every remaining call site (77) asks `tyHoldsHole`, and `tyReachesHole`,
`tyReachesHoleRow` and the module-level `trhPath` are deleted. A hole query now has one answer at
any depth.

| reading | value |
|---|---|
| seed | fixpoint on the branch and on master `e056e7cea`; every refresh exits 0 |
| identity | 2,827 of 2,827 files byte-identical (with #8624 and #8641 underneath) |
| probes | the eight recursive-type programs terminate and print the same |
| depth grid | 240 of 240 run; `deepnest_fnone_d12` runs with the budget gone |
| deep matrix | `record-nested-width-deep`: 46 of 48, as with #8624; 0 runs -> not-runs, 0 silent |
| distilled | no cell changed class |
| scaling | `vl_scaling_shape_test` 90 of 90 |
| guest fuel, L2 | 93,766,527,950 against master's 93,779,088,115 (-0.013%) |
