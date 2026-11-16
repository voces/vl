# L2 S3.4b, part 1: the member and UFCS kinds answer by rule in body order, 2026-11-16

The second kinds onto S3.4a's rule walk (`2026-11-16-l2-s3-plan.md`, option B). Identical.
- `validateMemCstrs` and `validateUfcsCstrs` become `memRule` and `ufcsRule`, one bound at a time.
  `cvNow` is saved and restored per row, as each validator did per loop. The solve's record of
  empty-list arguments already refused (`told0`) moves from the member validator to the walk.
- **Each rule kind keeps a home step** (`ruleKindOfStep`): `SS_RULES` for `BND_ARRDEF`, `SS_MEM` and
  `SS_UFCS`. A caller's range and mask still choose the kinds. Three callers depend on that:
  - `check_assignable.vl` masks out UFCS but keeps MEM;
  - `check_calls.vl` and `check_member_call.vl` solve only `SS_MEM..SS_UFCS`.

  The walk runs once, at the first included home step, over every included rule kind merged by
  `Bound.seq`.
- UFCS keeps its owner toggle (`selfOwner` around the rule when `at.toggles`).

## What moved

Nothing. Against master's fixpoint seed, both from one worktree, 0 of 20,677 programs change rc,
diagnostics or emitted bytes. That includes diagnostic order, even though the member and UFCS
judgements now run at the third step rather than the tenth and eleventh. No program in the corpus
gets a member or UFCS refusal at the same call as an earlier step's refusal.

## Not in this part

The rule changes the plan gives S3.4b are next. They are graded on D16384 (a type-bound member call
on an un-annotated parameter) and D3818 (an overloaded member call through a local alias of one):
- `BND_MEM` by width subtyping;
- `BND_UFCS` by resolution at the solved receiver.

D3818 shares its alias ingredient with D16807.

## Gates

See the PR.
