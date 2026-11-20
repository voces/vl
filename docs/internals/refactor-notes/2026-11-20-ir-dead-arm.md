# IR: a statement `if`'s dead arm, as legacy writes it (2026-11-20, lane IR5)

The checker records an arm a covering `is` test can never reach (`deadArmNote`, D16006): an
`else` after a test its operand always passes, a `then` under `!`. Legacy's statement `if`
(`emitIfStmtStmt`) writes no dead `else` (`ifWritesElse`) and `unreachable` for a dead `then`;
the arm is uncollected, so it owns no slots. The IR's `ifChain` built both arms, so a claimed
function with a dead arm wrote different bytes from legacy (the cases A/B could not see it: no
corpus function both had a dead arm and was otherwise claimed).

## The change

- `ifChain` (`ir_build.vl`): a link's `else` is built only when `ifWritesElse(n)`; a dead one
  ends the chain, as legacy's `else` branch skips the rest. A dead `then` is one `STrap`
  (`unreachable`), checked before a decided-false guard, as legacy orders them.
- The other `if` builders need nothing: legacy's value `if`, reference join and tail `if`
  (`emitIfTail`) write both arms whatever the checker recorded, and so do theirs.

## Witnesses

`tests/cases/conditionals/dead-else-not-written.vl` (a nested `else { if … else … }` and an
`else if` chain) and `dead-then-unreachable.vl` (`if !(v is i32)` with `v` always `i32`): each
mismatches legacy under the merge-base seed and is covered, verified and matched after.

Found by `null test boxTag`: `closure-result-variant-box-nullable.vl`'s `readIt` reaches a dead
`else` once its null test builds.
