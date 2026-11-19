# STORE B3.3 step 1: the shared hand-back at check (2026-11-19)

Site 9 of the 17 `ftLate` sites (`ftNodeOk`'s Call arm, `ftHandsBack`) had 12 late rows on
master `938930861`. This step moves 7 of them (336 → 329 late tag rows; 0 new).

## Mechanism
- `ftRetParamsOf` read `handBackHoleIx` only. It now falls back to `handBackShared`, as
  `elabMintRetFact` does (D15461): 1 row.
- `sbHandedBackSet` read one handed-back parameter only. A `const` bound to a call of a function
  handing back one of several parameters of one type parameter now holds the call's own set, the
  join, so `ftTry` retries it on the facts: 6 rows (`generic-fn-value-two-generics-either-returned-at-{one,two}-type(s)`,
  N {id}, N {dup}, N {id,dup} each).

## Measured
- `VL_LATE_DEMANDS=1 vl check --codegen tests`: the diagnostics are byte-identical to the hb HEAD fixpoint.
- The full @run A/B over 6,753 programs found 0 RC, wasm or output movers.
- Lines: compiler +9 / −2.

## Site 9's other 5 rows, by the probe's ftTry trace
- `generic-fn-value-two-type-param-params-one-handed-back` G {same}: the check never tries this
  set. `setBindTrySets` leaves a set with a generic member to the late decision, so this row
  belongs to B3.4 (the mint's per-instance data).
- `hole-fn-or-lambda-through-hole-handed-on` 2× T {<lambda>}, `tagged-fn-through-hole-param-keyed-at-set`
  P {add}: tried at check with the facts and refused. The value is handed through `fw` into a
  declared callee's parameter (`ap(fw(lam), 3)`, `m(fw(inc))`), so these rows belong to B3.10b,
  the per-(call, KeyId) arm.
- `hole-lambda-inferred-return-in-generic-at-two-pins` N {<lambda>}: tried at check with no fact
  and not handed (`deliver() { return fw(lam) }`, a hand-back one call deeper). It goes with B3.10b.
