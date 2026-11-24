# IR: a decided `is K[]` over a shadowed arm (2026-11-24, lane IR-N1)

`decided is fit shadow`: the builder skipped every decided list test (the IR's constant, `k ≥ 0`)
whose plan names a shadow. Since #9805 that is no blind spot. A decided test writes its constant
and never calls `listFitShadowSet`, so legacy registers no row and its region reads the binding.
The builder's rows come only from a shadow arm it builds, so the IR reads the binding too.

## What landed

- Both skip sites (the statement `ifChain` and the tail `if` link) skip only
  `decidedIsGrowShadowed`, under the named miss `decided is fit shadow grow`. That covers a
  shadow arm whose `listFitShadowPlanOf` answers 2: legacy's grow scan registers the row for the
  whole function whatever the guard decides, so the region's push reaches the grow local. It also
  covers, conservatively, a union arm's shadow rows. That union part holds 0 functions in
  tests/cases and in the corpus: the one `decided is fit shadow grow` function
  (`is-list-arm-push-through`) is a plain `V[]` receiver with a grow plan.

## Legacy tails the IR calls

- None new. `listFitShadowPlanOf` (`wasmEmit`, from #9805) is asked by the builder.

## Bytes and coverage

- Self-compile `--names`: identical 9,433, differ 0. `--cases`: identical 7,759, differ 0.
  `--claimless`: identical 14,453, differ 0. `tests/cases` A/B: same 8,876, differ 0. The moved
  list is empty. Mode 3 self-compile is byte-identical to legacy.
- `tests/cases`: `decided is fit shadow` 7 → 6 matched and 1 `decided is fit shadow grow`;
  covered = matched 79,735 → 79,741. The corpus is unchanged.
- Q58 sweep: `tests/ir-shadow-rows/is-decided-fit-shadow-positions.vl`. A generic
  `if v is f64[]` is decided true and false, with the region's read at a call argument (scalar
  and union parameter), a nested call argument, a concat operand, `return`, a `let` initializer,
  an `if` arm value, a `??` operand and a record field: base 9 misses, head 22 of 22 matched. The
  claim-mode build is byte-identical to the claims-off build and prints the same. The
  interpolation hole is its own program, since shadow rows build without std: 63 claimed,
  byte-identical, same output.

## Fuel

L2 +0.01% per PR on base 4b8ecaed.
