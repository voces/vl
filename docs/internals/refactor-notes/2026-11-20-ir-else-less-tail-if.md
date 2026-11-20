# IR: an else-less tail `if` (2026-11-20)

Legacy writes a tail `if` link with no `else` as `if c { <then-tail> } end`, with no `else`
(`emitIfLinkTail`). What falls through is its caller's pad: the function's own null, returned,
after a returned value `if` (`emitNullForRet`, `RRetNull` on the IR), or the body's fall-through
pad after a body-tail `if`. `tailIfPlainWhy` refused the link (`else-less tail if`). The IR now
builds it as an `SIf` with an empty `else` and no `else` keyword, and the existing pads follow.

This also takes IR-REV's #9274 nit: the lowering of `RRetNull` misses loudly
(`returned null with no plan`) where `nullRetPlanOf` has no plan, beside the builder's own check.

Measured at the merge-base in the PR.

Legacy lines deleted: 0. Moved to `@ir`: 0.
