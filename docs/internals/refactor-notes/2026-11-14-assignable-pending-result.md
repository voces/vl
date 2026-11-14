# Shape C of the negative-type sentinel: a pending function result, 2026-11-14

Lane J, the first fix after the census in `2026-11-14-assignable-negative-sentinel-census.md`.

## What changed

- `RET_PENDING` (`check_types.vl`) names the `-2` a hoisted un-annotated function's type carries
  while its return is being inferred.
- `fnSlotAssignable` answers `false` for a pending result, where it used to reach `assignable`'s
  `src < 0 || dst < 0` accept. 68 corpus programs reached it.
- `memberCallMapFilterTy` skips the predicate check while the callback's result is pending, and
  the call's re-check judges it. This is the behaviour it had before, now said explicitly. It was
  one corpus program.

## Why not demand-infer

The coordinator preferred demand-inferring the pending return, the path direct calls use. I tried
it first: a map from each hoisted pending row to its declaration, and a settle step in
`assignableGo`'s and `genericFnAssignable`'s function arms that forces the declaration. On all 68
programs the force ran (logged as `S-FORCED`), and the result was still pending afterwards,
both on the hoisted row and on the declaration's own row. The comparisons happen while the
declaration is itself mid-check (a pre-pass reading a value whose function is being inferred), so
there is no return to read yet. The explicit refusal is the outcome that is honest there.

## Evidence

- A scratch control on master that refuses `-2` in `fnSlotAssignable` moves no corpus case
  (oracle 7,736 / 0) and no distilled cell (0 `runs -> not-runs`, the same 28 pre-existing
  movements). The accept was not load-bearing, so the refusal costs nothing.
- `scripts/gate.sh` passes in full, on a fixpoint seed.
- `decl-order-ab.vl`: 315 of 5,097 cases move, 38 to a clause-1 outcome, 0 not in the baseline.
