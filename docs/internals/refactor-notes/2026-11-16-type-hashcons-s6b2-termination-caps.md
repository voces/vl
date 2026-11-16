# Type hash-cons stage 6b, batch 2: three termination caps become visited sets (lane H), 2026-11-16

6a (`2026-11-16-type-hashcons-s6a-cap-census.md`) found six recursive-type programs that did not
finish when every exhaustion cap was allowed to run deeper. Three caps fire in all six:
`tyMayHoldFn`, `tyHasInferHole` and `tyReachesClosure` (`check_types.vl`). Their depth was what
ended the walk on a cycle.

## The change

Each is an existence query: does the type reach a function, an inference hole, a closure. A row met
a second time adds nothing its first visit did not, so a visited set gives the exact unbounded
answer.
- **The walk.** Each function becomes a wrapper over a `…In(ty, seen)` walk.
- **What is recorded.** Only records and unions go into `seen` (`tyWalkEnter`). A cycle of VL types
  passes through one of them: through a list, a map or a function alone it is refused or bottoms out
  (D16733's table).
- **No allocation.** The three walks call nothing that re-enters them, so they share one module-level
  stack, `tyWalkSeen`, emptied at each outermost call.
- **The depth argument** goes from all 105 call sites.

## What changes for a program

Nothing on the corpus. Past the old limits (8 levels), the walks used to answer "no" on a deep or
recursive type. They now answer from the whole type.

## Cost

The first cut allocated a `seen` list per call and recorded every row. Its guest fuel, measured on a
fixed input (master's `compiler/entry.vl` under both seeds), was **+2.85%**. Recording only records
and unions, in one shared stack, with the check only in those two arms:

| seed | guest fuel | vs master |
|---|---:|---:|
| master (32ee97e56's fixpoint) | 90,822,204,339 | — |
| first cut | 93,407,732,125 | +2.85% |
| shared stack, every node through `tyWalkEnter` | 91,561,490,562 | +0.81% |
| shared stack, check in the record and union arms only | 91,442,628,764 | **+0.68%** |

The remaining rise is the walks now reaching the bottom of large types the cap used to stop at eight
levels. `self-compile-time.sh` reads +0.3% on its committed baseline, which passes.

## Found on the way

Checking that the walks terminate on every cyclic spelling found **D16733**: `type N = N | null`, an
alias that is its own member, exhausts the compiler's call stack at `vl check`. It does so on master
too, so this change does not cause it.

## Measurements

| reading | value |
|---|---|
| seed | fixpoint, branch and base |
| identity | IDENT |
| net compiler lines | NETLINES |
