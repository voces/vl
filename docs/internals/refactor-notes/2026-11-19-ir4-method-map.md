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

Fixpoint seeds: master 85ce0724c against this branch merged with it.

| | master | this branch |
|---|---|---|
| corpus functions covered = verified = matched | 33,340 | 33,512 (+172) |
| self-compile covered = matched | 13,922 | 13,922 |
| `method map` in the blocker census (one class alone) | 305 | 0 |

Of the 305 functions `method map` blocked alone, 172 are now covered. The rest stop at their next
class, since a statement stops at its first miss: `open parameter type` +17 and the for-in element
classes (`union` +20, `struct`, `nulstr`) take most of them. The self-compile uses `.map` and
`.filter` in no function that was otherwise covered.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,034, differ 0; self-compile identical (at c7f7f628b+) |
| `ir-identity.sh --cases` | identical 7,512, differ 0 (also re-run on the merged tree) |
| armed shadow / `--claims` | 33,512 matched / emitted, ok |
| mode 3 self | byte-identical, 0 fell back |
| L2 fuel | 99,902,506,328 against master's 99,794,501,004: +0.11% |
| pin helpers, `emit_mono.vl` | 905 |
| lint-self, `ladder-sets.vl`, phase state, late demands, dead exports | clean; ok; ok; 9; 0 |
| `deno task test` | 9,566 passed, 0 failed |

**Lines.** The compiler grows by 157 lines (+345 / −188). That covers the plan record and its
refusal constructor, the decision split out of the arm, the two tails, `RMapFilter` in the IR,
verifier and lowering, and the lint mirrors. Legacy's arm loses its inline body to the shared
halves, so this step moves lines; it deletes no ladder, because unclaimed functions still take the
arm. Under §10 it is a coverage step, graded on functions gained per line: 172 corpus functions for
157 lines.
