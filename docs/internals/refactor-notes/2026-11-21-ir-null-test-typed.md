# IR: the rewrite's desugared null test is typed, 2026-11-21

`rep ?` is the builder's miss for an expression whose node has no recorded type (`nodeTyAt` -1).
It blocked 75 corpus functions (53 alone) on master `5d2c2b81f`. A probe labelling each miss by its
node kind put the untyped `!=` first: the `l != null` that the rewrite's `??` and optional-chain
desugars build (`emit_rewrite`'s four sites and `wasmEmit`'s `coalNullTestIf`). Each recorded the
type of its synthesized `if` (`nodeTyCarry`), never of the comparison inside it.

## The change

- `mkNullTestNe(l, pos)` in `emit_rewrite` builds that comparison and records `TY_BOOL` on it, as
  the checker types every comparison. All five sites build through it.
- Legacy's bytes do not move. Shipped `tests/cases` A/B and `--names` are 0 differ, and a node's
  type is not read by `emitBin`'s null test.
- A bare block's `if true` is the next shape of the class. Typing its `true` reordered two module
  globals in one `tests/cases` program, so it is not in this change; IR-N2's #9356 owns it.

## Readings (merge-base `5d2c2b81f`, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| corpus functions with no blocker | 43,118 | 43,148 (+30) |
| corpus `rep ?` (alone) | 75 (53) | 12 (10) |
| `tests/cases` shadow covered = matched | 57,480 | 57,505 (+25) |
| self-compile functions with no blocker | 19,245 | 19,245 |
| L2 self-compile fuel | 104,385,711,979 | 104,394,549,673 (+0.008%) |

The 12 left are mostly holes in generic lambdas: untyped names and function literals.

Legacy lines deleted: 0. Moved to `@ir`: 0.
