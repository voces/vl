# IR coverage: `.map` and `.filter` (2026-11-19, lane IR4)

The blocker census on master put `method map` first among the unheld method classes: 305 corpus
functions blocked by it alone, 64 more beside `array ref`, and 32 and 21 beside the for-in element
classes.

## What changed

Legacy's `emitMapFilter` splits around its two operands, the way the seam template splits an arm
(refactor-notes/2026-11-19-ir-seam-frame-model.md, item 1):

- **`mapFilterWhy(callIx, fnIx)`** answers, without minting anything, whether the IR takes the call.
  It does when the receiver and result are lists legacy's arm takes (`mfRecvKindOf`,
  `mfResultKindOf`), and the callback is a capture-free function (a literal or a name, with no
  environment) or a function-typed binding. The builder asks it ahead of the lowering.
- **`mapFilterPlanOf(callIx, fnIx)`** computes everything the arm computed before writing the
  receiver: the kinds, the result slot, the callback's function and signature, the source and
  result types, and the frame locals. It is asked where legacy asks it, at the lowering, because
  the type lookups may mint.
- **`mfRecvTail`**, after the receiver, writes its recovery and store, and sets the element seats
  the loop reads.
- **`mfLoopTail`**, after the callback's closure value, writes its store, the loop and the result
  wrapper.

Legacy's `emitMapFilter` is now the plan, then the callback slot (`mfCallbackLocal`, reserved
before the receiver as before), then `emitExpr` of the receiver, `mfRecvTail`, the callback value
and `mfLoopTail`. The IR's `RMapFilter { hfV, hfC, hfAt }` (family `list`) lowers the same
sequence. The receiver is `irLOpnd(hfV)`. The callback is either `irLOpnd(hfC)` for a binding, or
legacy's `emitClosureValue` for a capture-free function, which `hfC` marks with the `null`
immediate. A capturing callback stays a named miss (`map callback env`), because its environment
is cached in legacy's frame state.

## Measured

Fixpoint seeds: master c7f7f628b against this branch merged with it.

| | master | this branch |
|---|---|---|
| corpus functions covered = verified = matched | 32,272 | 33,118 (+846) |
| self-compile covered = matched | 13,593 | 13,595 |
| `method map` in the blocker census (one class alone) | 305 | 0 |

BARS
