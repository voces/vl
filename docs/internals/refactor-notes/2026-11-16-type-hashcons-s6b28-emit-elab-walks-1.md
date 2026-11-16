# Type hash-cons stage 6b, tier 2: emit_elab.vl's reached walk limits, part 1 (lane HASH), 2026-11-16

The second tier of the s6b21 census: limits the 3,223 programs reach that do not end a walk on a
recursive type. This part converts the highest-reach sites in `emit_elab.vl`, 14 `walk-limit`
hits. Each walk now ends by a visited set or a growing path: a revisit is a cycle and keeps the
answer the limit gave.

| census row | function | was | now |
| --- | --- | --- | --- |
| 408 | `elabBoxedUnionsInto` | `depth` 4 beside its `walked` set | `walked` alone |
| 409 | `elabUnionArmsInto` | `depth` 1 or 8 | `seen` alone; the depth-1 call is `elabUnionDirectArmsInto` |
| 414 | `elabLitBindingFact` | `steps.length < 8` up the field chain | the chain's own end (a tree climb) |
| 383 | `elabSetRepTy` | `depth` 4 | path of types being rebuilt; a revisit stays as it is |
| 433 | `eplRebuild` | `depth > 8` | path of types; a revisit closes nothing (-1) |
| 358 | `elabResMayHoldAt` | `depth` 8 copies | declarations seen |
| 365 | `elabRetCallRecord`, `elabPlainRetRecord` (+ `elabReturnedSigsAt`, `elabCallRecord`, `elabRetValuesRecord`) | `depth` 4 | dropped: each memo is `none` while in progress, which already ends a cycle |
| 367 | `elabRetHolderCallGo` | `depth` 2 | declarations seen |
| 421 | `elabValueInstUp` | `ELAB_VALUE_INST_UP_MAX` 8 | (read, instance) pairs followed |
| 349 | `elabDeliverParams` | `ELAB_DELIVER_CALL_MAX` 8 | functions followed |
| 356 | `elabAliasReadsOk`, `elabAliasSource`, `elabReadSeedParam` | `depth` 8 | bindings seen |

## Grading (fixpoint seeds, master `bc6546163` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run on both seeds.
- Self-compile fuel: +0.6% on the baseline.
- `walk-limit` baseline: 545, master's 559 less these 14 (`emit_elab.vl` 82 → 68).
