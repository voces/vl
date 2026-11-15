# A record `is` narrowing a non-literal field, D4082 — 2026-11-15

Lane L, from the `--sites` ZERO rows in the union and narrowing area. Of the seven, only
`emitRecordFitIs` (wasmEmit.vl) was reached by a witness; the probe
`record-is-test-narrows-non-literal-field.vl` names it. D4082 had filed it in October.

## What moved

- **One content check per narrowed field.** `recFieldFitBuild` (check_annot_resolve.vl) mints
  `{ const $rf = x; $rf.f is F && ... }` when the tested record keeps the operand's fields and
  narrows some (`recContainedIn`), each field whose members `F` does not all cover tested at
  `F`. A contained record field recurses through its own minted check.
- **The union arm drops its literal-set gate.** `recPartFitArm` takes any arm the tested
  record is contained in, so `A | C`, `A | null`, `match` and the union cast reach the check.
- **The record cast.** `castRecordFitAt` takes the same shape; a cast whose hit is its own
  operand binds the hit before the test, which would otherwise narrow it for reads only.

## What did not move, and why

- **The emitter's literal-set lowering stays.** A generic or un-annotated operand gets no minted
  check, and that lowering is what runs the generic literal-set spelling today. D16325 files
  the non-literal one.
- **An operand a write narrowed is not minted.** `let w: A | B = a` is tested by its box's
  contents (D15955); minting at the narrowed `A` refused it at emit.
- **A field narrowed to a literal set over two bases is left to the emitter.** Its field test
  is wrong for `1 | "a"` over `i32 | string` (D16326, clause 1, on master already) and refused
  for `1 | 2 | null` over `i32 | null` (D16327); minting it turned D4086 from a loud refusal
  into a wrong answer. `litSetMixesBases` declines it.
- **A width-only fit is not minted.** `A | null` tested `is C` where `C` adds a field (D16377)
  moved from an emit to a check refusal under the first cut; the same-field-set rule restores it.

## Evidence

- Matrices `--before` the master fixpoint, no cell ran before in any of them:
  `record-is-narrows-union-field` 62 of 64 run, `record-cast-narrows-union-field` 64 of 64,
  `record-match-narrows-union-field` 46 of 46; 0 runs → not-runs, 0 silent. The two refused
  `is` cells (un-annotated `argument` and `early_return_guard`) are D16325's.
- `check-filed-witnesses --strict`: D4082 moves to runs, nothing else moves.
- Net compiler lines and the pin-helper count are in the PR body.
