# Step 7: classifier round 7, 2026-11-08

Round 7 of the post-mono-only classifiers. It uses the r6 shadow method
(`2026-11-08-step7-classifier-batch2-r6.md`): a scratch compiler computes the old and typed
answers at every call and counts each pair through `clsCensusEnter("SH …")`. The counts are calls
over the 23,615-program census population.

**Census** (`classifier-census.vl`, no `--callers`):

| tree | post-only | pre-only | both | probed |
| --- | --- | --- | --- | --- |
| master `eb1683ea` | 18 | 1 | 74 | 93 |
| this PR | CENSUS_AFTER |

**`ifExprRefKindOf` is the join's rep.** The classifier answered the join's HEAP kind, never a
nullable one, because `emitIfExprRef` derives null itself. It is now `repOfNode(if)`, with
`nulstr` projected to `str` and every other niche projected through `vkNonNullRefTwin`. A scalar,
atom, box or uncovered rep answers null. Shadowed over the population: 1,308 of 1,311 calls
agree. The three that disagree are `struct` → `variant`, in `if-arm-nested-join.vl`,
`if-expression-nullable-ref-arms.vl` and `D4644.vl`, and SWEEP_MOVERS. The 70-line ladder is
deleted, and with it `ifJoinIsMapUnion`, whose only caller it was. (r6 counted 324
disagreements at a different shadow point. Here the scalar and tagged short-circuits in
`ifExprRefKind` run first, so they never reach the reader.)

**`callLoweredKindOf` is deleted.** Its one caller, the `is`-test lacks rule in `wasmEmit.vl`,
only asks whether a call result is a `nulstr` or `nulbool` niche. That question now reads the
call's rep. The shadow compared that question, not the raw kind: 27 of 29 calls agree. The 2
that disagree are `d341_nt_str_match_null_in{0,1}`, where the rep is `nulstr` and the callee's
lowered kind is unknown. The tested type there is a newtype of string, not a record, so the
answer is `false` either way.

**`cloRetValSlot`: the r6 reading does not hold.** All 570 `struct:N` vs `closure` disagreements
come from 48 programs, and every one is a closure BUNDLE (the D15142/D15146 family): `lap(f)`,
called with `f` at two signatures, returns `f`, which is lowered as a bundle record. So does any
function that returns `lap(...)` (`mk`, `__gen`, `__deliver`). The type `fnRecordedRetTy` records,
a function type, is correct. The struct is a LOWERING fact, and today only the mono bundle
ledger holds it (`monoIsBundleTy`, `bundleRetParamOf`, the instance's synthesized `fnRet`).
Recording a bundle record as a result TYPE would put a rep into a type fact, so the producer
is not changed. The other 250 calls disagree only in the slot: `repOfTy` carries no slot
(`rdSlot` reads -1 throughout), so a slot needs an emit-side reader before it can be graded.
`cloRetValSlot`, `cloRetKeySuffix` and `mfStructResultRowName` stay.

**`arrLitRefListRow` is not dead.** Its asker `anonFieldElemName` still makes 99 pre-mono asks
on a tree that already has #6754.

**Proof.** PROOF
