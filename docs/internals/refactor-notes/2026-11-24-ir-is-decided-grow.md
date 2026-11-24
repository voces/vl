# IR: a decided `is K[]` over a growing shadow arm (2026-11-24, lane IR-N1)

`decided is fit shadow grow`: the last skip in the `is` family. #9826 kept a decided list test
from the builder when its shadow arm grows (`listFitShadowPlanOf` answers 2) or when the arm is a
union's. Since #9843 the builder carries legacy's grow rows, so the skip protected nothing.

## What landed

- Both skip sites (the statement `ifChain` and the tail `if` link) are gone, along with
  `decidedIsGrowShadowed` and `decidedIsShadowed`. A decided test writes its constant. The
  region's reads and pushes take the grow row the function's first `listFitGrowRow` query
  registers, as legacy's do, whatever the guard decides.
- `tests/ir-shadow-rows/is-decided-fit-shadow.vl` now expects the class to be gone.

## Legacy tails the IR calls

- None new. `listFitGrowOf`, `listFitGrowOpen`, `listFitGrowFill` and the `listFitGrowLenRow*`
  tails (`wasmEmit`, from #9843) serve the region.

## Witnesses

- `tests/ir-shadow-rows/is-decided-fit-shadow-grow-shapes.vl`: a pushing arm, a loop push, a
  read-only arm, and two union arms (`T[] | string`, `T[] | f64[]`). Base: 7 of 9 matched, with
  2 `decided is fit shadow grow` (the two pushing shapes). Head: 9 of 9. Only the pushing shapes
  took the deleted skip. The union witnesses already matched on base, because a decided union
  arm plans no grow row, so the union clause was idle. The read-only arm does not fill. Every
  build prints `0 0 1 1 0 3 3 0 1 1 0 s 0 1`, and the claim-mode build equals the claims-off one.
- Q58 sweep: `tests/ir-shadow-rows/is-decided-fit-shadow-grow-positions.vl`. A pushing arm,
  decided true and false, puts the region's read in these positions:
  - a call argument (scalar and union parameter) and a nested call argument;
  - a concat operand, `return` and a `let` initializer;
  - an `if` arm value, a `??` operand and a record field.

  Base: 9 misses. Head: 22 of 22 matched. The claim-mode build is byte-identical to the
  claims-off build and prints the same.
- The interpolation hole is its own program, because shadow rows build without std:
  `tests/cases/generics/is-decided-grow-length-in-interpolation.vl` (`n=0`, `n=1`), 63 claimed
  and byte-identical.

## Bytes and coverage

- Self-compile `--names`: identical 9,433, differ 0. `--cases`: identical 7,836, differ 0, with
  2 expected divergences (both listed in the baseline). `--claimless`: identical 14,462, differ 0.
  `tests/cases` A/B: same 8,955, differ 0. The moved list is empty. The mode 3 self-compile is
  byte-identical to legacy.
- `tests/cases` armed shadow: `decided is fit shadow grow` 2 → 0, and covered = matched goes
  from 82,266 to 82,268. The corpus is unchanged: 46,879 of 46,958 functions with no blocker on
  both seeds.

## Fuel

L2 −0.02% per PR on base 1784a86d.
