# A literal set over two kinds, D16326 — 2026-11-15

Lane L, the clause-1 row found closing D4082, and the two rows that share its route.

## What moved

- **One test per kind.** `litSetSplitBuild` (check_annot_resolve.vl) mints
  `{ const $ls = x; $ls is <one kind's members> || ... }` for a literal set over two kinds
  (`1 | "a"`, `1 | 2 | null`). Two integer widths are one kind, which the lowering already
  answers whole. An open operand is bound as it reads, so a hole parameter's pins test the
  same way. It mints only a test the shared predicate says may fit, so a refused test keeps
  its one refusal.
- **The gate keeps the operand's `null`.** The `is` gate asked `tyTestMayFit` of the
  operand's inner type, so a tested set's `null` met nothing (D16327).
- **A literal-set cast.** `castLitSetArm` makes a literal set the operand may hold the cast's
  own arm, through the same rewrite the record casts use (D16328).
- **The record field guard goes.** D4082's record test now tests a mixed-set field through the
  split, so D4086 runs.

## The mechanism, for the record

The emitter's string-membership rungs read the tested type's members through
`tyLitMemberTexts`, which answers string members alone, so the numeric members were never
tested. The emitter is unchanged: every part the split hands it is a set of one kind.

## Not moved

- `match` over a value union with literal arms is a check reject by the arm vocabulary.
- The then-arm read of a field narrowed to a string-bearing set stays at the declared type
  (D4058's storage rule), for a plain string set too.

## Evidence

- Matrices `--before` the master fixpoint: `mixed-literal-set-is-over-scalar-union` 64 of 64
  cells printed the wrong answer, all 64 run; `literal-set-cast-over-scalar-union` 0 of 64 ran,
  all 64 run. 0 runs → not-runs, 0 silent.
- Fixture `tests/cases/narrowing/literal-set-over-two-bases-runs.vl`, 26 values.
- A first cut split by width and refused `1 | 3000000000` over `i32` (D3655 and two fixtures);
  splitting by kind restores them.
