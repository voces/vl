# Step 7 L2 §7: the function-type walk stops at a function type whose arrow it cannot split, 2026-11-11

The walk re-census on top of #7176 (`2026-11-11-step7-l2-untyped-annotation-walk.md`) found 7
programs where `internFuncTypeShapesTyGo` cut a `[]` off a function type and walked the rest
untyped. The spellings were `(_) => _[]` and `(T) => T[]`.

The base is master with #7176, at `9723f0bd`. The population is the sweep's `cases` population.

## Cause

The arrow split, `annFnDecompose`, requires a `)` right before `=>`. A rendered generic or hole
function type spaces its arrow (`(T) => T`), so the split declines it. The walk then fell through
to the `| null`, union and `[]` peels, which read the function's result as if it were the whole
type. The level's type is a `TyFunc` the whole time.

## Changed

- `internFuncTypeShapesTyGo` returns once the arrow split has declined a `TyFunc`. Every arm
  below it reads a nullable, a union, a list or a record, and a function type is none of those.

`annFnDecompose` itself is not changed. Its `emit_mono` callers belong to lane w317, and making
it accept a spaced arrow would change what they see.

## Probe

The probe ran in a scratch compiler that was never refreshed into a seed, using the accumulator
of the predicates note. It tagged each time the new return fires. Across the cases population
it fires in 407 programs, so it is reached. Every spelling there is a spaced render of a generic
or hole function type, such as `(T) => T`, `(_, _) => _`, `(_) => _[]` or `(T[]) => T`. No
union of function types reaches it.

## Proof

- **Targeted.** The 407 programs were each built with the base seed and with the candidate: 0
  exit codes differ and 0 modules differ in bytes.
- **Checks.** These are listed in the PR. The full identity sweep is the PR's `sweep` job.
