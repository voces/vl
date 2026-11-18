# B3.2a: lambda members' facts at check; the fact-key net, 2026-11-18

Lane STORE, after B3.1 (#8994). The first B3.2 step, scoped as the coordinator ruled (option B): a
set moves to check only where every arrow row reaching it is closed, by the decision's own test
(`ftPlan` refuses `ftUseArrow && arrowSetOpen(s)`). A set some row leaves open stays late.

## Why the class-T sets stayed late

A probe on the 44 rows `ftLateArgOfSet` (site 15) decides gave the check's reason per set:
- 15 sets: the only open row is a lambda member's (`arrowNamedMembers`);
- 13 sets: never tried at check (they exist only at instance calls);
- 10 sets: open argument types;
- 6 sets: a body not keyed per set.

The lambda sets, when given facts, then failed at `ftNodeOk`'s lambda leaf (B2e's site 9), which
let a lambda stand as an id only after the elaboration.

## Change

- `arrowFactsBuild`: a lambda member's fact stands where the lambda types at the row's arguments,
  asked in a quiet run rolled back whole (`quietRunOpen` / `quietRunDrop(RB_ALL)`). Without the
  rollback, typing a lambda at a member's arguments it never meets (D10795's element pin)
  leaves diagnostics behind.
- `ftNodeOk`: under the check's fact retry, a lambda is its own leaf where it stands as a list
  element, or as an argument of a call through a set its callee does not hand back
  (`ftLamPlainAt`). An argument of a direct call to a declared function is excluded: there the
  instance keys the lambda's own types (the bundle-record programs).
- The safety net: `ftFactsCoverInstances` fails when an instance call (a mint row) through a set
  the check decided from the arrow facts has no fact for its source call at the same member
  results, and `elabPrepare` ends in `emitFail` (code 40).

Late code made dead and deleted: site 10, the `ftLateParamTakes` guard in `ftListCallHoleArg`.
It is 0 / 0 / 0 on re-ablation, and the only one of the 19.

## Retired late rows (baseline written from a fixpoint seed): 392 → 375

17 rows: 16 `tag T {<lambda>}` and one `tag P {<lambda>}`, in:
- `closures/hole-fn-list-called-at-three-fn-types.vl`
- `closures/hole-fn-list-called-at-two-fn-types-{choice-element,computed-index,in-function}.vl`
- `closures/hole-fn-list-handed-hole-lambda.vl` (3 rows)
- `closures/hole-fn-list-indexed-past-zero-capturing-lambda.vl` (3 rows)
- `closures/hole-fn-list-indexed-past-zero-{handed-lambda,lambda-handed-on}.vl`
- `closures/hole-fn-list-indexed-past-zero-lambda-result.vl` (2 rows)
- `closures/if-joining-hole-fn-then-annotated-called.vl` (`P`)
- `closures/shared-slot-hole-fn-and-closure-through-function-value-callee.vl` (2 rows)

Sets moved to check: 17. Kept late: 375.

## Grades (fixpoint seeds both sides, base `ecc0d4caa`, B3.1 merged into master)

- `VL_LATE_DEMANDS=1 vl check --codegen tests`: diagnostics identical; 17 rows gone, 0 new.
- @run A/B, 6,724 programs: 2 wasm movers, both printing their `@log` output.
  `hole-fn-list-indexed-past-zero-lambda-handed-on.vl` is one of the moved sets.
  `hole-fn-list-in-generic-handed-lambda-beside-lambda-call.vl` moves no row; a lambda fact now
  stands at check there.
- `check-filed-witnesses --strict`: 5,468 graded, 0 MOVED, 3,432 checked, 0 mismatched.
- The net's control: a throwaway in which no instance finds its fact makes 94 corpus programs end
  in the code-40 `emitFail`; the real build makes 0.
- Intermediate spellings refused on the way:
  - leaves at every position: 72 rows, 8 programs broken, 6 of them sets that ran as closures;
  - a direct-call position: the 5 bundle-record programs;
  - a literal-index exclusion: lost 10 rows and fixed nothing.
- L2 fuel 96.361G against the base's 96.339G measured alike (+0.02%). Census ok; lint clean;
  `emit_mono.vl` 908.
- Net compiler lines: +77 / −11. The net (condition 2) is 34 of the added lines.
