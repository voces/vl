# D1108: an inferred nullable map return is named at every map key kind, 2026-11-13

Lane E. The orchestrator assigned it because it owned the two `return_inferred` cells left in the
i32-keyed `optchain-map-leaf` matrix after D1680.

## Defect

An un-annotated function that returned `null` or an i32-keyed map floored at check: ``'pick'
infers the nullable return type {[i32]: i32} | null — type-valid, but an inferred return of this
shape is not yet supported by codegen; annotate the return type``. Its annotated twin ran. A
string-keyed map ran either way (D937/D956).

## Mechanism

`nullableRetName` (compiler/check_fit_rules.vl) names a nullable return for the emitter, and the
floor reads "no name" as "no rep". Its map arm admitted only a `string` key. The emitter side,
`inferredRetMapSlot`, takes the map's shape from the type, key kind included, so the name was all
that was missing.

## Changed

The map arm admits every key a map struct is minted for: `string`, `i32` and `i64`. A `Set` stays
out. That is D16037, now the `unsupported-lowering` channel tests' witness, the sixth time it has
moved (`tests/selfhost_native_diag_code_test.ts`, `tests/lsp_wasm_checker_test.ts`).

## Proof

- **Witnesses:** D1108's witness moves from `check_reject` to runs, printing `true`. The row had
  said the annotated twin prints `false`; it prints `true` on master too. D2648, whose remaining
  half was this nullable i32-keyed return, moves to runs, printing `10`. Both rows are closed.
  D16037 is filed open.
- **Position matrices**, before and after:
  - `scripts/capability-probes/matrix/inferred-nullable-map-return.matrix.vl` (new): 0 → **66 of
    66**;
  - the i32-keyed `optchain-map-leaf` variant: 64 → **66 of 66**;
  - string-keyed `optchain-map-leaf`: 66 of 66, unchanged;
  - 0 `runs → not-runs`, 0 silent, 0 traps.
- **Test:** `tests/cases/maps/inferred-nullable-map-return-every-key.vl`, five cells over i32,
  i64 and string keys, hit and null. On the base seed it floors at check.
- **Sweep** with fixpoint seeds on both sides, master `110eace0` against the candidate:
  - 24,249 same, **0 bytes-only movers**;
  - 3 output movers: D1108's and D2648's witnesses and the new test, each `check_reject` → runs;
  - 0 `runs → not-runs`, 0 new compiler traps.
- **Render-parse census:** within budget, at the baseline. No entry entered or left.
- **`scripts/gate.sh`:** all rows pass.
