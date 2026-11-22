# IR: a closure binding that shadows a function of its name, 2026-11-21

Lane IR-N6, the fifth slice of `call of a non-declaration`. Built on #9442. A call `qa(x)`, where
`qa` is a parameter or local holding a function value, and a function `qa` is also in scope.
Legacy's `emitCallCoreUserFn` calls through the closure when the name is a live closure binding,
and calls the function directly otherwise. `callRefPlainKey` refused every call whose name
resolved to a function in scope, so the IR refused the closure case too.

## The change

- `callRefPlainKey` (wasmEmit.vl) refuses a name with a function in scope only when legacy calls
  that function: unless `identNameIsLiveBound` and `identIsBoundClosure` both hold. Both
  emitters now read the same test.

The new row `tests/ir-shadow-rows/closure-call-shadows-fn-name.vl` has covered and matched floors
of 5 (base: 4).

## Readings (base: #9442's head `eb6ae028a`, fixpoint; candidate fixpoint)

| reading | base | this change |
| --- | ---: | ---: |
| `tests/cases` functions with no blocker | 66,295 | 66,317 (+22) |
| armed `tests/cases` covered / matched | 66,295 / 66,294 | 66,317 / 66,316 |
| `tests/cases` `call of a non-declaration` (any / alone) | 367 / 306 | 345 / 284 |
| corpus functions with no blocker | 44,652 | 44,652 |
| corpus `call of a non-declaration` (any / alone) | 21 / 20 | 21 / 20 |
| self-compile functions with no blocker | 19,593 | 19,593 |
| L2 self-compile fuel | 108,218,068,305 | 108,220,524,284 (+0.00%) |

On both seeds the armed fail and mismatch rows are the same three. Armed self is 19,593 covered,
verified and matched on both. The corpus has no such call; the population is `tests/cases`.

Identity, each with 0 differing and 0 timeouts:

| identity check | identical |
| --- | ---: |
| `--names` (self-compile also identical) | 9,037 |
| `--cases` (witnesses 60 the same) | 7,596 |
| `--claimless` | 14,017 |
| mode 3 corpus (mode 3 self also identical) | 9,037 |
| `tests/cases` A/B | 7,316 |

Late demands stay at 9 and late tag rows at 307. `scripts/gate.sh --fast` passes. Then a clean
merge of master `f1b142006`, which holds #9442.
