# Type hash-cons stage 6b, tier 2: check_store_rep.vl and check_side_rows.vl (lane HASH), 2026-11-16

Two small files in one change. `check_side_rows.vl` goes 1 → 0 and `check_store_rep.vl` 5 → 1.

| census row | function | was | now |
| --- | --- | --- | --- |
| 225 | `notePendingNulList` | `depth > 4`; `depth > 0` meant "below the bound's own type" | types seen, and a `nested` flag for "below the bound" |
| 229 | `storeLitHeldAt` / `storeSlotHeldAt` | `depth` 4 of nested literals | the literal tree's own end |
| — | `storeRepOf` | `depth` 4 down an index chain | the chain's own end |
| — | `solePinPeel` | `hops < 8` | values seen |
| — | `retValueRootCall` | `hops < 64` | bindings seen |

## `callBuiltTy` stays

`callBuiltTy` (row 226, `depth` 8) was converted to a path plus a memo per question, and backed
out. `tests/vl_scaling_shape_test.ts`'s "records returned through a deep call chain" (each `g_i`
returns three calls of `g_{i-1}`) measures it:

| seed | 50 deep | 200 deep | ratio |
| --- | --- | --- | --- |
| master | 63.7M | 225.8M | 3.5 |
| path only | — | compiler trap (3^k) | — |
| path + per-question memo | 148.9M | 2,052.9M | 13.8 (quadratic) |
| this change (`callBuiltTy` unchanged) | 63.7M | 226.1M | 3.5 |

The question is asked once per call node and re-walks the chain each time. Ending the walk without
the bound needs a memo that lives across questions, invalidated by the checker tables it reads
(`recFnValueLeaves`, `recBuiltReadTy`, `recHeldDecl`, ...). That is a design change of its own.

## Grading (fixpoint seeds, master `d7a6bf679` vs this branch)

- Identity sweep: all 3,223 programs byte-identical.
- `regress.vl`: 0 `runs → not-runs`, 0 → silent, no cell changed class.
- Deep-nesting grid: 240 of 240 run.
- `tests/vl_scaling_shape_test.ts`: 91 of 91.
- Self-compile fuel: 94,390.7M against master's 94,388.8M.
- `walk-limit` baseline: 540.
