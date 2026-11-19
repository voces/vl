# IR: an instance's arm-tag `is` test, and its decided guard (2026-11-19)

The blocker census ranked `is rung` first among my classes: 683 corpus functions blocked alone.
Grouped by originating grid, 507 are `nj2`, whose cells each hold a generic `kind<T>` testing
`v is i32` / `i64` / `f32` / `f64` against an instance's box; the rest spread over 30 grids. Split by
`isArmOf`'s rung (a probe seed naming it, not committed), `armTag` holds 550 alone; `never`,
`litArms`, `emptyFit` and `static` hold 36, 35, 19 and 18. Within `armTag`, `tagIsArmOf` splits
it into `identBox` (the box's own tag read off its raw slot) and `tagAbsent` (a tag no arm of the
box carries, a decided `false`).

`identBox` builds as `RTest` over the box variable, now carrying the tag it compares
(`isArmTagOf`, lowered by `boxTagIsTail`, which `variantTagTail`'s bytes equal). A narrowed
receiver is tested at its storage (D2447): the builder sets and restores legacy's storage mode
(`storageReadEnter`) around its asks, and reads the variable raw (`rawBoxVar`), as
`emitUnionBoxPush` does. A boxed nullable (`rnDisc` 4) is the same box.

Covering `identBox` alone unblocked about 0 functions: the census is an upper bound, and those
functions held further blockers behind it, mostly the std float printer every `nj2` cell compiles
(`expression as`). The payoff was `tagAbsent`. Legacy writes `i32.const 0` and reads that constant
back off its own bytes (`staticIsGuard`) to drop the guarded arm (D932). The decision is one shared
function, `isDecidedFalse` beside `staticIsGuard`: legacy's two statement-`if` writers
(`emitIfStmtStmt`, `emitIfLinkTail`) write a decided test as `i32.const 0` through `emitGuardCond`
before reading it back, and each `ifChain` link asks the same predicate, so the two cannot
disagree about a dropped arm. Legacy's dead-arm write (`isDeadArm`) never meets a decided guard: the checker
notes a then arm dead only under `!`, when every value of the operand passes the test
(`check_statements.vl`'s `deadArmNote`), and never in an instance, while `isDecidedFalse` takes
only a bare `is` test.
Anywhere else (`!`, `&&`, a value `if`) legacy folds the constant, so `tagAbsent` there stays the
named miss `is arm tag tagAbsent`.

The self-compile's own narrowed chains (`if n is A … else if n is B` over AST nodes) were `is
guard` on master, 695 functions blocked alone: a narrowed receiver tested at its storage on the
`variant` rung. In storage mode the read is the declared box, so a plain variant row's tag
(`isVariantTagPlain`, asked in storage mode) compares over the raw slot too. Self-compile
functions with no blocker: 12,663 → 13,327.

Measured on fixpoint seeds, master d1de0b7d against this branch:

| | master | this branch |
|---|---|---|
| corpus functions with no blocker (blocker census, of 45,675) | 30,703 (67.2%) | 31,207 (68.3%) |
| armed sweep: functions covered = verified = matched | 67,239 | 67,854 |
| mismatch / fail | 0 / 0 | 0 / 0 |
| corpus mode-3 claimed | | 31,207 |

Legacy lines deleted: 0. Moved to `@ir`: 79, the decisions and tail the IR now asks
(`exprUnionIdent` 45, `repNarrowedArm` 17, `boxTagIsTail` 6, `paramUnion` 6, `storageReadEnter` 5).
