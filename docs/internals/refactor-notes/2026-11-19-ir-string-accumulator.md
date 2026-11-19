# IR coverage step: a string accumulator append, 2026-11-19

Lane F2. A coverage step under `ir-design-2026-11.md` §10, after the append-site step (#9139);
measured on fixpoint seeds of this branch and master `ee0f8bc8c`.

## Why this class

With append sites covered, `string accumulator` was the self-compile's remaining in-place string
class: 146 functions first-missed on it. The corpus holds no accumulator its census attributes a
miss to.

## What landed

- **One shared tail.** `strAccAppendTail(binIx, fnIx)` is `emitStrAccAppend` after it pushes the
  parts that follow the accumulator: it reads the accumulator (local slot or module binding), grows
  its buffer when the parts do not fit, copies them and stores the result. Legacy ends through it.
- **The IR.** `assign` builds those parts as `str.acc`, an effect keyed by the assignment, instead
  of skipping; the lowering re-reads `strInPlaceMode` and misses when the accumulator is no longer
  proven. The decision is the one legacy reads (`strAccAppendOk`, through `strInPlaceMode`).
- **The rescan guard.** `strSiteOfRhs` now takes `strInPlaceMode`'s rescan (`saScanFor`), so either
  is safe to call before the function's scan (IR-REV's note on #9139).
- **Not covered.** A start body's accumulator is a module cell scanned by `strAccScanStart`, and the
  start build still refuses it by name (138 self-compile start functions).

## Coverage

| population | before | after |
| --- | ---: | ---: |
| self-compile functions covered (18,989) | 13,665 | 13,797 |
| self-compile first-miss `string accumulator` | 146 | 0 |
| corpus functions covered (45,675) | 33,286 | 33,286 |

All covered functions verified and matched (shadow mode 1). `ir-identity.sh --names` against
master's seed: identical 9,034, differ 0, self-compile identical; `--cases`: identical 7,512, differ 0.
L2 fuel, same box on both fixpoint seeds: master 99,820,247,197, this branch 99,794,041,090 (−0.03%). Functions gained per compiler line: 132 self-compile over +42 net
compiler lines (57 added, 15 deleted); legacy's accumulator lines are moved into the shared tail,
not deleted.
