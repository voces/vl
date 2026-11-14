# D3373: `??` over a nullable function value is the closure's own nullable ref, 2026-11-14

Lane E. The orchestrator scheduled it as the last spelling of the `?.`/`??` family after D16036.

## Defect

`(if n == 2 { f } else { null }) ?? g` was a loud emit refusal (`` `??` over this nullable value is
not supported yet ``) for every `fn | null` left operand, bound or not. `?.f ?? (() => d)` over a
function field refused at the nullable-record arm (``no `if` blocktype for this field's rep``).

## Changed

- `emitCoalesceGo` gains a rung beside the nullable-collection one: `exprNulClosure` →
  `emitCoalesceNulRef` at `cloStructIdx`. This is the `br_on_non_null` core every nullable ref
  takes.
- `emitCoalesceOptNulRecord` hands a function-value leaf to the same core, as it hands a map leaf.
- **The end-of-ladder arm is removed.** Lane D's #7912 (D2340) had added an end-of-ladder arm
  (re-readable `F | null` → `coalNullTestIf`), gated on `tyIsNullableFn`. Behind this rung it is
  dead: an `emitFail` probe on it reached 0 of the sweep's 24,281 programs and none of the
  `uninit-let-shared-with-closure` matrix's cells. It does fire against a control with the rung
  disabled. Agreed with lane D, the arm and `tyIsNullableFn` are deleted, leaving one `??` arm for
  the kind.
- **Position witness.** D2467's `as?` refusal (`emitAsNulNiche`) is now `emitFailAt` at its
  operand, and becomes the instance-position witness (D15155, D15157,
  `vl_emit_diag_position_test`), since this PR closes the one it used. A stable replacement is
  proposed in `2026-11-14-instance-position-witness.md`.

## Proof

- **Witness:** D3373's moves from `emit_reject` to runs, printing `103`, `101`. The row is closed.
  D2467, D15155 and D15157 grade `emit_reject` as filed.
- **Position matrices:**
  - `scripts/capability-probes/matrix/coalesce-nullable-fn.matrix.vl`, whose proof calls the
    result: 0 → 48 of 48 graded positions run.
  - `uninit-let-shared-with-closure` (#7912's) stays at 124 of 124. The 18 skipped are the discrimination
  positions, which a non-nullable result has none of.
- **Test:** `tests/cases/expressions/coalesce-nullable-function.vl`, ten cells:
  - the witness, and a `let` reassigned from null to a function;
  - `?.f ?? (() => d)`, hit and miss;
  - a named-function default, and a capturing default.
- Sweep with fixpoint seeds on both sides, master `0876fe92` (after #7912) against the candidate:
  - 24,272 same, 0 `runs → not-runs`, 0 new compiler traps;
  - 2 output movers, D3373 and the new test, both `emit_reject` → runs;
  - 7 bytes-only movers with identical output. They are exactly the programs #7912's arm lowered,
    now on this rung: D3170, D3245, D3371, D4341 and #7912's three `closures/` fixtures. The
    `wasm-dis` of `closures/coalesce-nullable-function.vl` goes from a re-read null test to
    `br_on_non_null` (0 → 4) and from 449 to 368 lines.
- Render-parse census: within budget, at the baseline. No entry entered or left.
- `scripts/gate.sh`: all rows pass.
