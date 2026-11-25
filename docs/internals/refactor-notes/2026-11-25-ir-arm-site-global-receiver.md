# IR arm site: a global's box read again in each arm (2026-11-25, lane COV-IS)

INFRA's I8 red list (#10096) names 47 programs whose first stub in the deleted-legacy build is
`reentry emitDelivered`.

- **No IR path reaches `emitDelivered`.** A probe that refuses it under the claim seam finds 0 rows
  over every `tests/cases` program and inventory witness on master `165d853b8`.
- **All 47 leave a start body (44) or `@init` (3) unclaimed.** Legacy writes that body in the
  deleted build, and its first `emitExpr` is `emitDelivered`'s.
- Each turns, then, on its start or `@init` miss. This note takes `arm site operand` (3 programs:
  `arrays/is-list-arm-read-at-numeric-literal-set.vl`, D17001, D17002).

## What landed

- **The miss**: the start bodies read a module global holding a union of lists through an arm
  site, under an `is K[]` narrowing. The global's read is a temp (`RGlobalGet`), not a re-readable
  variable, so `armSiteRead` refused it. Legacy re-reads the name before each arm's tag test and
  before its cast.
- **Builder**: a named receiver whose temp the last node defines by `RGlobalGet` is accepted
  (`globalReadLast`).
- **Lowering**: such a receiver is consumed once unwritten (`irLSkip`). Each arm then writes the
  global's read, the tag test, the read again and the cast (`armSiteGlobalArmOpen`).
- **Legacy**: `armSiteArmOpen` is split byte-neutral into `armSiteArmTest` and `armSiteArmCast`,
  which legacy and the IR both call.

## How it was measured

- **The three red-list start bodies**: each is claimed and matches under `VL_IR_SHADOW=2`.
- **Legacy identity**: the 1240 `tests/cases` programs under `unions/` or named `*arm*` build
  byte-identical under a compiler built from `origin/master` and under this one.
- **Q58 position sweep** (`tests/cases/unions/arm-site-global-receiver-positions.vl`, new): the
  global read through an arm site as a call argument, a `let` and an interpolation hole at module
  scope, and as a return, an `if` operand, an arithmetic operand and a `print` argument in
  functions.
  - On master, 4 functions and the start body are `arm site operand` misses.
  - Here all 65 functions match, and the start body reaches `box of a valued if` next.
  - It prints its 8 lines.
