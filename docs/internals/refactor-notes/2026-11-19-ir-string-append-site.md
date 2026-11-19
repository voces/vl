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
- **The IR.** `buildStrBin` asks `strSiteOfRhs` whether its chain is an armed site's right side
  and builds it as `str.site`, `soAt` the assignment; the store around it is the IR's ordinary
  local, global or element store. No builder state carries the arm: `assign` checks that its store
  built the site's node (`siteBuilt`), and a site whose right side was delivered another way stays
  a miss (`string append site`), as does a lowering the scan does not arm.

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered | 12,663 of 18,905 | 12,720 of 18,910 |
| self-compile first-miss `string append in place` | 198 | — |
| self-compile first-miss `string accumulator` | — | 132 |
| corpus functions covered (45,675) | 30,703 | 31,043 |

All covered functions verified and matched (shadow mode 1); the mode-3 self-compile is
byte-identical to the shipped build. The corpus gain is the census's whole alone-blocked count.
Functions gained per compiler line: 57 self-compile and 340 corpus over +69 net compiler lines
(84 added, 15 deleted); legacy's site lines are moved into the shared tail, not deleted.

`ir-identity.sh` against master's seed: identical 9,034, differ 0, self-compile identical;
`--cases`: identical 7,512, differ 0.
