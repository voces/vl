# IR: a block body's last statement is a statement (2026-11-21)

A block body returns a value only through `return`. Legacy's `emitFuncBody` takes a block body's
last statement as its tail only when it is a `return`; any other last statement it writes as a
statement, and `emitFallThroughPad` writes the result's `null` or `unreachable` after it
(`fallThroughPadOf`). The IR's `tailReturn` missed three such tails (`block body falls off`,
`valued tail loop`, and a falling `if`, `valued tail if`). It also took a last value `if` through
`lastStmtIsValueIf` as a tail `if`, so a claimed function returned an `else` arm's assignment where
legacy falls off to `null` (D17038, clause 1, shipped on master).

`tailReturn` now builds a block body's last statement with `stmt` for every kind, before any
tail-value test. Rule 5 of the verifier reads the same pad the lowering writes
(`fnFallThroughPadOf`, shared by `lowerBody` and the verifier), so a body that falls into a
`null` or `unreachable` pad is not a falls-off failure.

One shape stays a miss, `tail if is chain falls off`: a falling `if` chain with an `is` link.
Legacy writes such a chain's statically decided last test without its test, a decision it reads
off its own bytes (`staticIsGuard`), so the IR cannot share it. Five `tests/cases` programs
(exhaustive `is` chains with no `else`) and the self-compile's `nodePos` found it.

Measured on fixpoint seeds at merge-base `6851d881` (functions with no blocker): self-compile
19,054 → 19,069 of 19,376, covered = matched; corpus 41,780 flat; `tests/cases` armed shadow
covered 54,003 → 54,044, matched 53,989 → 54,030, with the same 16 fail or mismatch rows.
`block body falls off` 8 → 0, `valued tail loop` 5 → 0, `valued tail if` 3 → 0; two functions
stop at `tail if is chain falls off`.

Legacy lines deleted: 0. Moved to `@ir`: 0.
