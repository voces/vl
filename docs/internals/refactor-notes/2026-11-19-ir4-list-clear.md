# IR coverage: a list's `.clear()` (2026-11-19, lane IR4)

On master 8b89f4bc3, the blocker census (`VL_IR_SHADOW=4`) showed `method clear` alone blocking 5
self-compile functions. The compiler's own 36 `.clear()` calls are on module-level lists.

## What changed

Legacy's `emitClear` used to make its decisions and then reset the receiver's length. It is now:
- **`clearPlanOf`**, a pure plan: the receiver, the wrapper whose length is zeroed, and the push
  scratch base and ref-list slot the receiver stages at;
- the receiver, through `listOpRecvLocal`;
- **`clearLenTail`**: `L.len = 0`, keeping the backing.

The statement ladder's list test is the shared **`clearRecvIsList`**. A map's `.clear()` still
takes `emitMapClear`. The decisions and refusals come in the old order with the old messages; a
ref-list row that does not resolve is the plan's `row` and still raises through
`refListRowRefused`.

The IR adds **`RListClear { lkV, lkAt }`** (family `list`, statement only). The builder takes it
where legacy's ladder does: `isListClearStmt` asks `clearRecvIsList`, and a failed plan skips. The
receiver must be a list rep. The lowering resolves the receiver as `lowerPop` does:
`listOpRecvHeld` held, or the operand staged by `stageListRecvTail` at the plan's
`listOpStageBase`. It then calls `clearLenTail`. The verifier wants a list receiver and no
destination. As a value, the lowering misses with `clear value`.

IR-REV's #9180 follow-up is also here: `lowerListSlice` misses with `slice arity` when its bound
count and the plan's `slArgs` differ.

## Measured

Fixpoint seeds: master 0f47d5e4d against this branch on the same base.

| | master | this branch |
|---|---|---|
| self-compile claimed (mode 3) | 15,885 | 15,895 (+10) |
| corpus covered = verified = matched | 35,488 | 35,488 |

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `ir-identity.sh --cases` | identical 7,516, differ 0 |
| `--claims` / mode 3 | ok / identical |
| armed shadow | all matched; ok |
| L2 fuel | 100,684,520,768: +0.075% on master (100,608,951,220) |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, ladder-sets, dead exports, comment budget | clean / ok / 0 / ok |
| phase state | ok; the `emit_plan_list.vl` surface fall it reports (17 → 15) reads the same on master, so it is not this branch's |
| late demands | 9 of baseline 9, 307 tag rows |
| `deno task test` | 9,579 passed, 0 failed |

**Lines: compiler +197 / −99.** Nothing is deleted. In `wasmEmit.vl` (+111 / −81), the clear body is
regrouped into the plan and the tail, and the plan type is new. The IR side adds about 70 lines.
This is a coverage step.
