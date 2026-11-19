# IR coverage step: a scalar list `.pop()`, value and statement, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10; measured on fixpoint seeds of this
branch and master `b306ab952`.

## Why this class

Split by mechanism, the self-compile's `method pop` misses were mostly a `.pop()` at a value
position over a number list: 88 functions it alone kept uncovered, 134 first-misses. The statement
pop's own refusals (`pop typed element`, `pop niche`, `pop element`) held 25 more first-misses.

## What landed

- **One scalar pop tail.** `popScalarTail(callIx, recvIx, lIdx, wrap, back, getIdx, nulBox, fnIx)`
  is everything `emitPopGo` did for an i32 or scalar list once its receiver is held: the unchecked
  read of a pop the checker typed as the element, the boolean and atom niches, the number null box
  at a value position, and the checked drop of a statement pop. Legacy's `.pop` and `.get` end
  through it; their scalar branches are deleted, not mirrored.
- **The IR.** A value-position `.pop()` with a scalar plan (`popPlanOf`) builds as an `RListPop`
  value; a statement pop as before. Both hold or stage the receiver as the statement pop did, then
  take the tail; a statement drops what it left, as legacy's statement caller does. With the tail
  shared, `popStmtPlainWhy` and its three refusals are deleted.
- **The verifier.** A value pop's destination is its element, its i32 niche or a non-scalar box.
- **Not covered.** A ref or string list's pop (`pop ref element`, `method pop` on such a list) is
  the next step.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered (18,993) | 14,112 | 14,224 |
| self-compile first-miss `method pop` | 142 | 9 |
| self-compile first-miss `pop typed element` + `pop niche` + `pop element` | 25 | 0 |
| corpus functions covered (45,678) | 33,583 | CORPUSA |

All covered functions verified and matched (shadow mode 1). A probe of value and statement pops
over i32, f64, boolean, i64 and u8 lists prints the same under mode 3 as shipped, with an identical
module. Functions gained per compiler line: 112 self-compile over +31 net compiler lines (111 added,
80 deleted, `popStmtPlainWhy` among them); legacy's scalar pop lines are moved into the tail.
