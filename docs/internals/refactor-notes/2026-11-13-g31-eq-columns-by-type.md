# D16052: the box `==` columns carry member types, not member spellings, 2026-11-13

Lane G. `unionBoxEqColumns` returned each arm's atom spelling, and `unionArmTagOf` looked the
arm's type back up by that spelling (`armTyOfUnionTy`, a walk of `unionTyArms` comparing atoms).
The column now holds the member type itself. `armTyOfUnionTy` is deleted, and
`armRowTysOfUnionTy` / `armRowsOfUnionTy` lose their `atoms` out-parameter, which nothing else read.
The staged compare cores (`emitUnionBoxEqStaged`, `emitUnionBoxEqStagedX`, `emitUnionCloTagIn`)
drop the `uty` parameter that only fed that lookup.

Two exact swaps ride along: `emitListIsAcrossReps` and `boxRetagArmsOfTys` read
`unionTyMemberTys` (#7845: the same coverage as `unionTyArms`, member types alone).

## Probe

A probe compiler recorded, at every scalar arm `unionBoxEqColumns` admits, whether
`armTyOfUnionTy(uty, atom)` equals the column's member type and whether the two give the same
tag. It ran over 24,020 programs: 24 programs reach the column (226 arm reads), with 0 type
disagreements and 0 tag disagreements.
