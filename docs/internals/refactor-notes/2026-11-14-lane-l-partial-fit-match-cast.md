# The partial record fit in `match` and `as`, and over a nullable union — 2026-11-14

Lane L, after #8080 minted the partial fit for `is`. The point of #8072's one predicate was
that the three spellings agree; this makes them agree on the partial fit too.

## What moved

- **`match`.** `matchTypePatCover` (check_match.vl) mints `recPartFitBuild`'s check on a pattern
  that names no member but one member partly fits, and the pattern covers no member. The lowered
  `if` chain reads the pattern's `isFit` as `is` does.
- **`as?` and `as!`.** `castPartFitAt` (check_operators.vl) rewrites the cast in place to
  `if x is B { const $rh: A = x; $rh } else { null }` (`__trap__()` for `as!`), binding a non-name
  operand once first, the list-union rewrites' shape. The binding at the arm is the delivery that
  unboxes it; yielding the narrowed read itself built an invalid module (caught on the first
  build).
- **A nullable operand.** `recPartFitArm` takes a `null` member as one that never fits.

## Evidence

- Fixture `tests/cases/narrowing/record-partial-fit-match-and-cast-runs.vl`: each spelling, a
  field read in the arm, the nullable operand in all three, distinct values.
- Seed fixpoint; `gate.sh`: D4087 moved check reject → runs, its row closed.
- Net compiler lines +89 (93 added, 4 removed); emit_mono.vl unchanged at 908.

## Residue

D16322: a field read straight off `as! B` (`(r as! B).x`). D4089 (narrowing to `B`) stays
frozen for lane E.
