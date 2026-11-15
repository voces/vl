# Relate B1: the join arm and the return-value probe ask through `fitsExpr`, 2026-11-15

Review medium 3, the step after B0 (`2026-11-15-relate-b0-fits-expr.md`). Two more fit questions
stop spelling out the `inferQuiet` / `quietDepth` bracket:

| site | before | after |
|---|---|---|
| `joinArmFits` (`check_relate_core.vl`) | bracket around `checkerForceFn(1, …)`, the `assignableExpr` hook | `checkerForceFn(4, …)`, a new hook kind that is `fitsExpr` |
| `retValsDeliverQuiet` (`check_inferred_return.vl`) | bracket around `retValsDeliver` | `retValsDeliver(…, ask = true)` asks each value through `fitsExpr` |

`retValsDeliverQuiet` keeps its diagnostic truncate, since the quiet ask can still raise a
diagnostic. Moving `a20RetWalk` out of the bracket is safe: it reads no `inferQuiet` and writes only
its own memo.

The brackets that remain need more than one call quieted, or a quiet type-level `assignable`:
- `assignableExprIn`'s `rtStamp` re-ask: `listArmOfUnionFit` reaches `listLitExactArm` →
  `arrLitFitsList` → `assignable`, which pins holes unless `inferQuiet` is set.
- `validateCompArgCstr`: `litPinAssignable` also runs `joinLitsFitAt` and has loud callers.
- `dstTyParamAdapts` ×2, `callArgRepTy`, `callRetRepTy`, `binCstrPairRefusal`: type-level, which
  is stage C on lane H's `tyPin*`/`tyLink*` choke point.

## Measurements

- `phase-state-census.vl -- --list`: the `inferQuiet` hidden scopes go from 16 to 14. `--check`
  passes.
- Identity: fixpoint (two refreshes of this tree are cmp-identical, 6,395,142 bytes).
  `probe-rollback-census.ts --fingerprint` over the 20,370 programs in tests/fixtures, tests/cases
  and the distilled cells and named sets is byte-identical to B0's, which was itself identical to
  master's.
- Net compiler lines: +2 (28 added, 26 removed; the hook kind costs 4). `emit_mono.vl` functions:
  908.
