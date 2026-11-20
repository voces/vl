# Legacy: the dead retag in a union field's `??`, deleted, 2026-11-20

Lane F2. Found while splitting `emitCoalesceUnionField` for the IR arm parked on branch
`f2/ir-coal-field` (closed #9246); the plan and refusal split stay on that branch beside their IR
consumer, and only this deletion lands (coordinator, 2026-11-20).

Legacy wrote `const munTy = mphysTy`, then, in both present arms of `o.v ?? d`,
`if msSetOfTyAny(munTy) != msSetOfTyAny(mphysTy) { emitBoxAtomRetag(mphysTy, munTy, lhsIx) }`: a
comparison of one value with itself, so the retag never ran. Both calls go, and with them
`emitBoxAtomRetag`, which had no other caller; its contract comment moves to
`emitBoxAtomRetagMembers`. `emitCoalArmRecv` stays: it is the arm's live receiver read.

Byte-identical: see the PR for mode 3 and the `ir-identity` corpus A/B. `wasmEmit.vl` +7 / −26.
