# IR: an operator's left operand staged below a valued right `if` (2026-11-20)

A binary operator whose right operand is a valued `if` (a short-circuit, or an `if` expression)
missed as `short-circuit right operand` unless its left operand was a temp. Legacy writes the left
operand first, then the `if`. The IR's `if` is a statement before the operator, and the lowering
writes a variable or an immediate at its reader, so without staging the left operand would land
above the `if`. Calls already stage such leads below an argument's `if` (`irBStageLeads`, #9289).
The operator now does the same when its right operand is the `if`'s own out.

There is one exclusion, which the corpus found. A call through a hole function dispatches on a tag:
the dispatch writes the stash's `local.get`/`local.set` before its `if`. `tagDispatch` already
refuses to be built above a waiting temp (`tag dispatch after an operand`), but a lead staged
after the dispatch is built bypassed that check. Ten distilled `named/` cells (D16209, D16278,
D16279, D16806, `dord002`) then covered and failed to lower (`non-stack temp: out of order`).
The operator now refuses to stage over a tag stash and names the same miss.

Measured on fixpoint seeds at merge-base `6851d881` (functions with no blocker): self-compile
19,054 → 19,059 of 19,376; corpus 41,780 → 41,780 of 45,678, all matched, claims 41,689 flat.
`short-circuit right operand` 5 → 0; one of the five then stops at `member record`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
