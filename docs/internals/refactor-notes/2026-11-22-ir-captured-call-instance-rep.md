# IR: a captured call's closure typed by the instance legacy calls, 2026-11-22

Lane IR-N6, the `captured call closure rep` class. Take a direct call of a nested function that
reads its captures from an environment. Legacy's `emitCapturedCall` builds the instance's closure
over a fresh environment and calls it at the instance's own `$fnsig` (`fnSigIdxOfFn(pos)`). The
IR typed that closure's temp with the call read's type. For a generic nested function the read
carries no type in the caller's frame, so the temp had no closure rep and the call was refused.
#9484 exposed this class: before it, these calls stopped at `call target`.

## The change

- `capturedCallRhs` (ir_build.vl) types the closure temp with `capturedCalleeTy`. That is the
  callee declaration's type, closed by the instance `pos` legacy calls (`elabInstTyAt`), else the
  declaration's own type, else the read's. The call's signature is legacy's `sig` as before. Every
  closure lowers to one closure struct, so the type gives the temp its rep and cannot move a byte.
- A generic nested function instanced at two types has no single recorded declaration type. It
  keeps the named refusal.

The new row `tests/ir-shadow-rows/captured-call-nested-generic-instance.vl` has covered and
matched floors of 4 (base: 3).

## Readings (base: master `a1270d7bd`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 68,087 | 68,112 (+25) |
| armed `tests/cases` covered / matched | 68,087 / 68,086 | 68,112 / 68,111 |
| `tests/cases` `captured call closure rep` (any / alone) | 115 / 112 | 59 / 56 |
| corpus functions with no blocker | 45,027 | 45,027 |
| self-compile functions with no blocker | 19,748 | 19,748 |
| L2 self-compile fuel | 110,247,977,377 | +0.00% |

Not every call the class loses becomes a covered function. A function whose captured call now
builds may stop at its next blocker, mostly `closure env capture` and `captured call argument
coercion`. On both seeds the armed fail and mismatch rows are the same three.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,609 |
| `--claimless` | 14,018 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,329 |

Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes, and so does
`tests/vl_ir_shadow_test.ts` (246 passed).
