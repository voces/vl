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
- **Position witness.** D2467's `as?` refusal (`emitAsNulNiche`) is now `emitFailAt` at its
  operand, and becomes the instance-position witness (D15155, D15157,
  `vl_emit_diag_position_test`), since this PR closes the one it used. A stable replacement is
  proposed in `2026-11-14-instance-position-witness.md`.

## Proof

- **Witness:** D3373's moves from `emit_reject` to runs, printing `103`, `101`. The row is closed.
  D2467, D15155 and D15157 grade `emit_reject` as filed.
- **Position matrix:** `scripts/capability-probes/matrix/coalesce-nullable-fn.matrix.vl`, whose
  proof calls the result: 48 of 48 graded positions run. The 18 skipped are the discrimination
  positions, which a non-nullable result has none of.
- **Test:** `tests/cases/expressions/coalesce-nullable-function.vl`, ten cells:
  - the witness, and a `let` reassigned from null to a function;
  - `?.f ?? (() => d)`, hit and miss;
  - a named-function default, and a capturing default.
- Sweep with fixpoint seeds on both sides: SWEEP.
- Render-parse census: CENSUS.
- `scripts/gate.sh`: all rows pass.
