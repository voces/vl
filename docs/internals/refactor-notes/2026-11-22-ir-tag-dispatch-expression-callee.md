# IR: a tagged call statement reads its callee as any expression, 2026-11-22

Stacked on #9467 (`tagDispatchVoid`, IR-N7), now merged. A statement call through a tagged set of
generic or hole functions refused any callee that was not a bare name, as `tag dispatch callee
expression`. The callees it refused were a list element (`fs[0](x)`), a captured cell (`k(x)`,
rewritten to `k[0](x)`), a record field's list, a returned list, an `if` and a call. This is the
`index notclosure` slice of `indirect call`. The coordinator ruled it onto the existing
tag-dispatch route, with no closure-call path.

## The change

The skip is deleted. `tagDispatchVoid` already reads the callee with `irBExpr` and stashes its set
id before the arms' `if`s, the order `emitFnTagDispatch` writes (`emitExpr(c.callFn)`, then
`tagStashTail`). The skip guarded a lowering refusal, `operand above a valued if's value`, from the
time an index's valued-if miss covered the whole index. Since `ifBelowLeadOf` (441444ba) that miss
reads only the index part past a temp receiver, so a callee holding a valued `if` misses by its own
name (`index valued-if operand`), and the void dispatch's `if`s leave nothing on the stack beneath
the callee. The valued form `tagDispatchAt` never had the skip, and its spellings match too. No new
predicate, no new state, and no route decision: the dispatch is still `callStmtDispatches`.

## Readings (base #9467's head 857fd011, fixpoint seeds on both sides)

| reading | base | this change |
| --- | ---: | ---: |
| tests/cases armed shadow covered / matched | 67,298 / 67,297 | 67,369 / 67,368 (same single fail row) |
| the 77 tests/cases files that hit the skip, covered (= matched) | 601 | 661 |
| corpus functions with no blocker | 44,826 | 44,852 |
| corpus `tag dispatch callee expression` | 26 | 0 |
| self-compile functions with no blocker | 19,668 | 19,668 |

Legacy lines deleted: 0. Moved to `@ir`: 0.
