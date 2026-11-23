# IR: a direct call targets the function legacy's scope chain names, 2026-11-22

Lane IR-N6, the `call target` class. Legacy's `emitCallCoreUserFn` calls the function
`fnIndexOfInScopeChainAt` resolves for the call's name, now `userFnCallTarget`. It takes the
block-local function covering the call, else a top-level one, keyed by `armCalleeName` in a
generic's instance. The IR asked `fnIndexOfNode` instead, then matched the result against the
declaration through the mono instance tables (`callTargetIs`). That was a restatement, and it
refused every call where the two disagreed: mostly nested functions inside generic instances.

## The change

- `callRhs` (ir_build.vl) takes a direct call's target from `userFnCallTarget`. It refuses only
  where `userFnCallRoutesRef` sends the call through a closure instead, as `emitCallCoreUserFn`
  does. Both are exported from wasmEmit.vl; `callTargetIs` keeps only `exprTyOf`'s type lookup.

The new row `tests/ir-shadow-rows/call-nested-fn-in-generic-instance.vl` has covered and matched
floors of 8 (base: 2).

## Readings (base: master `dfc71b020`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 67,164 | 67,253 (+89) |
| armed `tests/cases` covered / matched | 67,164 / 67,163 | 67,253 / 67,252 |
| `tests/cases` `call target` (any / alone) | 121 / 118 | 0 / 0 |
| corpus functions with no blocker | 44,812 | 44,824 (+12) |
| corpus `call target` (any / alone) | 12 / 12 | 0 / 0 |
| self-compile functions with no blocker | 19,660 | 19,660 |
| L2 self-compile fuel | 108,981,906,629 | +0.05% |

On both seeds the armed fail and mismatch rows are the same three. Armed self is 19,660 covered,
verified and matched on both. No function misses at the new `call routed through a closure`.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,604 |
| `--claimless` | 14,017 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,324 |

Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes, and so does
`tests/vl_ir_shadow_test.ts` (227 passed).
