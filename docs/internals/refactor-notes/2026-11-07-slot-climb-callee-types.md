# The elaboration records the callee types a literal slot's climb reaches

`2026-11-07-slot-climb-calls.md` (#6712) left `monoReachLitTys` and `monoReachSlotTy` as a driver.
It looped over `vrLits` and wrote `nodeTyRecord(callFn, ct)` on each call that a literal slot's
climb reached. That was mono writing a type into a callee node. The orchestrator ruled that the
elaboration records these types itself. This PR makes that change and deletes the driver.
Measured on master `270e7fa0`, over the sweep population of 23,611 programs.

## The record

`elabLitSlotCallees()` (`emit_elab.vl`) walks every `ArrayLit` and `ObjLit` that check typed,
using `cwIxCoveredLen`. It reads each literal at its delivered type, `nodeRepTyIxOf`. For each
open function slot that is not a tagged set, it records `elabLitSlotCallTy`'s type against each
callee its climb reaches. The table is `elabCalleeTys`, keyed by the source callee node. A callee
that two slots reach at different types gets -2, which records nothing.
`elabNodeTy`, `elabNodeTyAt` and `elabInstNodeTy` read the table through `elabCalleeTyOf`. That
function also answers for a copy, through `nodeSrc`, as long as the copy's own type is still open.
`elabCopiesOf` is no longer needed and is deleted.

`monoLitSlotCallTy` and `monoFnTyRetAt` move into the elaboration as `elabLitSlotCallTy` and
`elabFnTyRetAt`. `monoOpenFnArgDecl` and `monoFnDeclRetAt` already had elaboration twins,
`elabOpenFnArgDecl` and `elabFnDeclRetAt`, which are now exported and called by mono.
`monoFnDeclRetAtUnder` stays as a one-line adapter. It maps an instance's lambda clone to its
template (`monoLamCloneTmpl`), which is mono state, and calls `elabFnDeclRetAtUnder`.

## Four mechanisms the write-back hid, each found by one witness

The old gates read the column after mono had retyped the arena. At elaboration time, three of
them read a different fact. The fourth was a property of the write itself.

| witness | the old write was gated by | the elaboration's fact |
|---|---|---|
| D9572 (`take({ f: inc0 })`), D9644–D9952, D15524 | the literal's column type, which mono closed | its delivered type, `nodeRepTyIxOf` |
| D15049, D15167 | `fnTagTyIsTagged(st)`, which is decided after `elabRun` | run after `elabPrepare`'s tag rounds |
| `hole-fn-list-map-callback-generic-call-loop-alias` | mono's per-literal retype; otherwise the last write won | two slots that disagree → -2 |
| D9572's `f64` instance | the copy's own column type, already closed | `elabCalleeTyOf` declines a closed copy |

Because of the second row, the record step runs after `elabSlotBundleFacts` in `elabPrepare`,
and after `elabPrepareRun` on the unprepared path. It does not run inside `elabRun`.

## Proof (fixpoint seeds, `origin/master` merged)

| | |
|---|---|
| sweep, same | 23,611 / 23,611 |
| output movers / bytes-only movers | 0 / 0 |
| runs → not-runs / new compiler traps | 0 / 0 |
| D15113 (101), D15115 (48), D15206 (15) named cells | all `runs` |
| `fn-same-shape-records-*`, `record-of-named-fn-in-generic-field-*`, D15472, D7202 | `runs` |
| seed | 6,478,397 → 6,477,045 bytes (−1,352) |
| pin-helper budget (`emit_mono.vl`) | 943 → 937 |

The control was a one-level build off the setup seed with only the `nodeTyRecord` removed. It
lost 5 runs: D15472, D7202, both `record-of-named-fn-in-generic-field-*` cases and
`written-let-in-list-iterated-in-two-instances`. On an earlier tree, #6712 measured the same
removal at 70.

## What is left

- **`vrCalls`** stays in `value_reach.vl`. Its only reader is `vrInert`, in the same file, which
  `vrInertFor` and mono's pruning read.
- **`vrLits`** had no reader left and is deleted.
- **`monoFnDeclRetAtUnder`** remains as the adapter described above. It retires when the
  elaboration knows which template a clone came from.
