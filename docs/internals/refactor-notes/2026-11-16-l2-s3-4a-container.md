# L2 S3.4a: the read-only map floor lifts, and the array-default kind answers by rule, 2026-11-16

The fifth step of the S3 plan (`2026-11-16-l2-s3-plan.md`), graded. Two changes:
- **The floor lifts.** `holeDemandOk` refused a hole map demand the body left open (a callee that
  only reads its map), and that refusal fired only when the body came before the call (D16714).
  The argument now pins the demand in either order.
- **Body order begins.** `solveRules` walks the callee's bounds of every kind that has a rule,
  merged by `Bound.seq`, and applies each row's rule. `BND_ARRDEF` is the first kind:
  `validateArrDefCstrs` becomes `arrDefRule`, one bound at a time, and its step `SS_ARRDEF` is
  now `SS_RULES`. The later S3.4 kinds join `ruleKinds` as their rules replace their validators.

## What the floor hid, re-run first

The floor was measured as hiding 10 wasm traps and 1 wrong output when it was added. Re-run as a
read-only grid of 432 cell/twin pairs: 9 read operations, 6 value types, 4 argument forms and both
declaration orders, each graded against its annotated twin. Lifting the floor alone gave 262 cells
that ran, but 14 built invalid modules and 6 refused at emit. The same failures were already live
on master in the declared-after order, which the floor never reached. They were filed and fixed
before this step:
- D16794, D16795 and D16797 (#8633): a parenthesised `??` read at the Paren node's open type.
- D16796 (#8647): a hole's `??` narrowing an existing record.

On this seed all 432 cells run in both orders, 282 of them refused by the floor on master.

## Moved diagnostics

Fingerprint against master `d14f2c88`'s fixpoint seed, both from one worktree: 3 of 20,666
programs move.
- `tests/cases/maps/infer-param-map-read-only.vl` (the floor's own case, renamed from
  `error-infer-param-map-not-pinned.vl` and extended): the floor's refusal, now runs.
- `tests/cases/maps/error-infer-param-map-not-a-map.vl` (new): a failed open demand now says
  `argument 1: expected a map, got i32`. The floor's annotation advice no longer describes why the
  program is refused.
- `scripts/silent-sweep/distilled/named/d16121_argument_unann.vl`: loud to loud, from the floor's
  check reject to an emit reject in `unionArmRowsOfTy`. It needs a local alias of the parameter, an
  inferred map and a hole function together. Filed as D16807 and left open (coordinator,
  2026-11-16).

The rule walk alone is identical: 0 of 20,662 programs move against the floor-lift seed before it.
With one kind it visits that kind's rows in the order the validator did.

## Rows

Run with `check-filed-witnesses --strict`:
- Close: D15161 and D16714.
- Keep their filed outcome: D16207, D3368 and D16715.
- D16807 is filed as today's floor reject. Its mechanism names the emit reject above.

## Gates

See the PR.
