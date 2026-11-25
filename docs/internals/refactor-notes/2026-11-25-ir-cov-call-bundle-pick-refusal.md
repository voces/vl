# COV-CALL: the IR raises the bundle-pick refusal (2026-11-25)

Lane COV-CALL; the I8 red list's "plain closure call disagrees" ×3 (regeneration 7: D17096, D17106,
D17585).

## Mechanism

Legacy refuses a direct call of a function returning its bundle parameter where the value is used
at none of the members: `bundleResultPickOf` answers `bpHeap` -2, and `emitBundleResultPick` raises
"a function returning a parameter called at two signatures is called where its result is not used
at one of them". The IR built the call regardless. Armed, its later closure call disagreed with
legacy's, and with legacy deleted nothing raised the contract refusal. `bundlePickRefused` (ir_build)
asks the same pick after `callRhs` builds an `RCall`. When the pick is refused, it raises legacy's
sentence through `emitFailAt` inside the claim's soft scope, as `callSplitRefuse` does, and misses.

## Proof

- Under the I8 sweep's compiler (`ir-i8-sweep.sh … --pops probes`, legacy deleted), all three
  witnesses read `an IR claim refused inside … (emitProgram: a function returning a parameter called
  at two signatures …)`. That is the design's sentence, not the internal disagreement.
- **Q58:** `tests/cases/closures/bundle-result-unused-refused-{two-shapes,captured-holder}.vl` pin
  the refusal at two shapes in one map and at a captured holder in a function. One file per
  position, since an emit refusal stops at its first error. D17096's module map-store spelling is
  its inventory witness; a test of it would add a late demand (`h`). A function-local map store
  whose result is never read again runs, and is no refusal.
- **The claims-off fallback tests:** `vl_ir_claim_fallback_test`, `vl_claim_fallback_wasm_test` and
  `playground_claim_fallback_test` used `closure-stored-from-function-refused.vl` as a claim that
  escaped legacy's refusal into an invalid module. The claim now raises that refusal itself, so they
  expect its note, `an IR claim refused inside …`. The invalid-module-and-legacy-refuses outcome
  has no natural witness left; the fault-injected control still covers legacy building.
