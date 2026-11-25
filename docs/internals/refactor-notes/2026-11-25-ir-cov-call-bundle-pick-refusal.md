# COV-CALL: the IR declines a refused bundle pick (2026-11-25)

Lane COV-CALL; the I8 red list's "plain closure call disagrees" ×3 (regeneration 7: D17096, D17106,
D17585).

## Mechanism

Legacy refuses a direct call of a function returning its bundle parameter where the value is used
at none of the members: `bundleResultPickOf` answers `bpHeap` -2, and `emitBundleResultPick` raises
"a function returning a parameter called at two signatures is called where its result is not used
at one of them". The IR built the call regardless. Armed, its later closure call disagreed with
legacy's, and with legacy deleted nothing raised the contract refusal. `bundlePickRefused` (ir_build)
asks the same pick after `callRhs` builds an `RCall`, and when the pick is refused the builder
declines the statement (`irBMiss("bundle result pick refused")`). It raises no sentence of its own.
INFRA classified legacy's sentence as a mechanism, not a contract, and the scoreboard's CONCEDES
phrases do not match it, so an IR copy of it would hide these legal programs from the clause-2
count at I8. The decline alone stops the invalid module, and at I8 the programs read as `cannot yet
lower (bundle result pick refused)`, honest capability debt (coordinator ruling 2026-11-25, INFRA's
option b).

## Proof

- On today's seed the decline hands the statement to legacy, which raises its sentence with the
  note `the IR declined this statement (bundle result pick refused)`; armed, the internal
  disagreement is gone.
- **Q58:** `tests/cases/closures/bundle-result-unused-refused-{two-shapes,captured-holder}.vl` pin
  the refusal at two shapes in one map and at a captured holder in a function. One file per
  position, since an emit refusal stops at its first error. D17096's module map-store spelling is
  its inventory witness; a test of it would add a late demand (`h`). A function-local map store
  whose result is never read again runs, and is no refusal.
- **The claims-off fallback tests:** `vl_ir_claim_fallback_test`, `vl_claim_fallback_wasm_test` and
  `playground_claim_fallback_test` used `closure-stored-from-function-refused.vl` as a claim that
  escaped legacy's refusal into an invalid module. The IR now declines it, so they expect legacy's
  refusal carrying the decline's note. The invalid-module-and-legacy-refuses outcome has no natural
  witness left, and INFRA retires it in the cutover plan's §8; the fault-injected control still
  covers legacy building.
