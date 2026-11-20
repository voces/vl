# IR: a valued `if`'s arm prelude, `else if` chain and literal `true` (2026-11-20)

`ifExprPlainWhy` refused any valued `if` whose arm was not one lone value statement
(`arm not lone`). On master `e26a31b8d` that row was 79 self-compile functions. It covered three
shapes legacy writes on the plain path:

- an arm whose statements run before its value (`emitIfArmOpen`). `ifArm` and `refIfArm` now build
  each prelude statement before the value. A prelude local the collect pass did not allocate is
  still legacy's own refusal (`armPreludeUnwalkedDecl`), now named `arm prelude unwalked`. The join
  plan is classified with the prelude's locals bound, as `emitIfExpr` classifies it.
- a direct `else if`. Its else node is an `IfStmt`, not a block, so the chain step never reached
  it. It is now the next link.
- a rewrite's `if true { <spills> v } else { <placeholder> }`. The old `constant condition` rung
  refused it. Legacy writes the dead block `else` as `unreachable` (`staticValueIfCond`,
  `emitDeadValueArm`). The IR builds that `else` as `STrap`. Both decide it through one predicate,
  `valueIfLitTrue`. A literal `false` was never folded and stays plain.

Measured with the blocker census against master: self-compile functions with no blocker
17,339 → 17,380 of 19,160. The 22 `constant condition` functions now stop at their next blocker:
19 at `map read default computes` and 3 at `if after an operand`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
