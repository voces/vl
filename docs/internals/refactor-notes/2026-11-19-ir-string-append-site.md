# IR coverage step: a string append site, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10; measured on fixpoint seeds of this
branch and master `93c5fe0f1`.

## Why this class

`string append in place` was the corpus's largest single-class blocker: 340 functions it alone kept
uncovered. Split by mechanism, all 340 are append sites (`strSiteArmsAt`) and none the loop
accumulator (`strAccAppendOk`). In the self-compile the class had 198 first-misses: 132 accumulator,
66 site.

## What landed

- **One shared decision.** `strInPlaceMode` (replacing `strAssignInPlace`) returns -1 for the
  accumulator, else `strSiteArmsAt`'s mode, which legacy's `strSiteArm` already arms from. The
  builder skips the accumulator (now `string accumulator`) and arms the site's right side.
- **One shared tail.** `strSiteCatTail(n, mode, binIx)` is `emitStrSiteCat` after its operand
  loop; legacy's site lowering ends through it.
- **The IR.** `buildStrBin` builds the armed right side as `str.site`, `soAt` the assignment; the
  store around it is the IR's ordinary local, global or element store. A site whose right side the
  store did not deliver through `buildStrBin` stays a miss (`string append site`), as does a lowering
  that finds the site no longer armed.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 12,663 of 18,905 | 12,719 of 18,908 |
| self-compile first-miss `string append in place` | 198 | — |
| self-compile first-miss `string accumulator` | — | 132 |
| corpus functions covered (45,675) | BASECORPUS | 31,043 |

All covered functions verified and matched (shadow mode 1); the mode-3 self-compile is
byte-identical to the shipped build. Functions gained per compiler line: 56 self-compile over +40
net compiler lines (54 added, 14 deleted); legacy's lines are moved into the shared tail, not deleted.
