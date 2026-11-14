# The partial record fit over a union, as a minted check — 2026-11-14

Lane L, PR-2 of the `is`/`match`/`as` membership-vs-value-fit family, on PR-1's predicate.

## What moved

- **The check.** `recPartFitBuild` (check_annot_resolve.vl), beside `mapFitBuild`, mints
  `{ const $rf = x; if $rf is A { const $ra: A = $rf; $ra is B } else { false } }` as the test's
  `isFit` where `tyTestMemberFit` finds exactly one record member `A` partly fitting `B` by
  literal-set fields (`recFitNarrowedFields`) and every other member a record that never fits
  (`recPartFitArm`). The inner test is D4058's record fit, already lowered.
- **The narrowing.** The `then` narrows the operand to `A` (check_narrow_flow.vl), the arm the
  check unboxes, not to `B`: the emitter's narrowed read unboxes an arm, and `B` is no arm.

## Evidence

- Fixture `tests/cases/narrowing/record-partial-fit-over-union-runs.vl`: a field read under the
  test, a negated test, a loop over a list of the union, a two-field record, distinct values.
- `gate.sh`: the one movement is D4089, filed emit reject, now a check reject at its
  `const y: 1 | 2 = r.x` (the field reads as `A`'s `i32`); its row is re-graded.
- Net compiler lines +102 (106 added, 4 removed) over PR-1; emit_mono.vl unchanged at 908.

## Open

D4089: narrowing to `B`, which needs a narrowed read to unbox a type stored as another arm.
D4087 (`match` arm `B`) and `as? B` over the same operand mint no check yet; both stay refused at
check, as on master. A nullable operand (`A | C | null`) is not minted.
