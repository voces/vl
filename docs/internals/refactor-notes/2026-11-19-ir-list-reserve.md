# IR coverage step: a declaration's list reserve region, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10; measured on fixpoint seeds of this branch
and master `0f47d5e4d`.

## Why this class

`declaration list reserve` kept 56 self-compile functions (73 first-misses) and 53 corpus functions
uncovered: a `let xs = []` whose pushes follow is built by legacy at its final size (D3623), and the
IR refused the declaration outright.

## What landed

- **The open, shared.** `listReserveOpen(s, stmts, pos, idx, slot, fnIx)` is `emitListReserve` after
  its sibling check: it sizes the backing for the pushes `listReserveScan` counts and opens the build
  region. Legacy calls it with its published siblings; the IR's `reserve.open` raw effect calls it
  with the declaration's block, found by walking the body, and the frame's own slot for the `let`,
  `declaredSlotOfDecl`, whose index must be the one `varSlot` holds.
- **The close, shared.** `listBuildClose` (exported) writes the region's length back. The IR places a
  `reserve.close` raw effect after the region's last statement, inside that statement's span, as
  legacy's `emitStmtIn` writes it inside the span `bankBodyStmtSpan` records.
- **The pushes.** Unchanged: the IR's push ends in legacy's `emitPushAppend`, which takes the open
  region's fast path through `listBuildRegionOf`.
- **The verifier.** The two effects are legacy calls, not raw wasm, so rule 10 admits them outside a
  runtime helper, with no operands.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 15,885 | 15,946 |
| self-compile first-miss `declaration list reserve` | 73 | 0 |
| corpus functions covered (45,678) | 35,488 | 35,541 |

All covered functions verified and matched (shadow mode 1); the mode-3 self-compile is byte-identical
to the shipped build. A first cut placed the close after the statement's span and mismatched 57
functions' spans; inside the span all match. `ir-identity.sh --names` against master's seed:
identical 9,037, differ 0, self-compile identical; `--cases`: identical 7,516, differ 0. Compiler
lines: +100 net (108 added, 8 deleted); legacy's reserve body is moved into `listReserveOpen`.
