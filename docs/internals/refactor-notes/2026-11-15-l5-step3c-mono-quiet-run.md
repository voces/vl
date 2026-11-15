# L5 step 3c: the pinned mono re-check opens a `QuietRun` (2026-11-15)

Part of L5 step 3 (`CheckRun`, `2026-11-14-phase-products-design.md` §2.2), after step 3a
(`2026-11-15-l5-step3a-quiet-run.md`).

## What changed

- **`check_rollback.vl`:** `type MonoSave = {quiet, sym, mark}` is deleted. It held exactly what
  `QuietRun` holds.
- **`monoRecheckBegin` (`check_assignable.vl`):** it opens its run with `quietRunOpen()`, which
  replaces `prbEnter` plus the hand-built save and its three writes. It returns `QuietRun | null`.
- **`monoRecheckEnd` (`check_demands.vl`):** it closes with `quietRunEnd(sv)` and
  `quietRunDrop(sv, RB_MONO, site)`. The probe site's name is still chosen by `tpIfCmpOn`.
- **Order:** `prbEnter` now runs after `monoRecheckDepthSet`, and the flags are restored before the
  rollback, not after. Neither `prbLens` nor `checkRollback` reads the depth or the flags, and the
  fingerprints confirm the reordering is safe.
- **Untouched:** `emit_elab.vl`'s caller holds the run as an inferred `sv`, so it does not change.

## Gate

- **Seeds:** A is a fixpoint built from `git archive 30248860f`; D is a fixpoint built from this branch.
- **Identity:** `probe-rollback-census.ts --fingerprint` over `tests/cases`, `distilled/cells` and
  `distilled/named` gives **20,310 programs, 0 different**.
- **L2:** byte-identical, and guest fuel is equal (88,505,808,811).
- **Gates:** `regress.vl` reports no runs lost and `lint-self.sh` is clean. The probe-rollback,
  emitter-state audit, phase-state, memo-generation and pin-helper tests pass.
- **Census:** `phase-state-census --write-baseline` records step 4b's fall in
  `check_capture_rows.vl` (hidden 4 → 0), which #8321 did not write.

## Lines

The compiler is **+10 / −34, net −24** over 3 modules.
