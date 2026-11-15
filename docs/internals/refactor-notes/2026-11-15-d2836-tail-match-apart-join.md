# D2836: a tail `match` keeps a type parameter's list apart in the return set

2026-11-15, lane I. Bucket (f), re-confirmed on master `a8ab9bc03`. `return match k { 0 => ys, _ =>
xs }` over `xs: T[]`, `ys: string[]` was typed at the call as one list where the same `if` is
their union (#3211's return-set rule), so the call's re-check refused it.

- `tailSpineNode` (`check_leaf_steps.vl`) carries the return-tail position through a block, an
  `if`, a `return` and a paren, but not a `match`, so `checkMatchExprNodeIn`'s `mTail` was always
  false. A `match` is now on the spine (D1580's chain: a match's arms are the return as an `if`'s
  are).
- A tail `if` seeds the inferred return with each arm, so the join keeps a type parameter's list
  apart. A `match`'s arms are adopted to its collapsed join before any seed could read them, so a
  tail `match` in a generic body seeds the join it already records apart (`tpIfJoinAt`, written by
  `noteTpJoinRow`) instead (`matchSeedTailArms`, `check_match.vl`).
- Neither alone closes the row: the spine without the seed leaves the collapsed note, and the seed
  never fires without the spine.

Measured on fixpoint seeds (master `a8ab9bc03` vs this branch): the 7-cell
`d2836-tail-match-apart-join` named set, all `runs` (5 refused on master); regress: no cell changed
class (0 of 260630). Pin helpers (`emit_mono.vl`): 908 → 908.
