# D16036: a standalone `?.` function-value leaf is the closure's own nullable ref, 2026-11-13

Lane E. Split from D1680, which built the map leaf; the orchestrator scheduled it after D1108.

## Defect

`const v = mk()?.y` with `y: () => i32` was a loud emit refusal (``a standalone `?.` has no rep
for a closure leaf field``). It was the last leaf rep `emitOptMemberValueGo` had no arm for.

## Changed

- **The function-value arm.** `emitOptMemberValueGo` gains a function-value arm with the list and
  map arms' shape over the one closure struct, `cloStructIdx`. A closure cell, nullable or not,
  is `(ref null $clo)`. The fallback refusal now reads ``no rep for this leaf field``; no `?.` leaf
  the corpus or the probes reach still hits it.
- **A positioned refusal.** The nullable-record `??` refusal (``no `if` blocktype for this field's
  rep``) is now `emitFailAt` at its expression, not `emitFail`, so it names the body line inside a
  parameter's instance. It is the position guard's new witness.
- **The position witness moved.** D15155, D15157 and `vl_emit_diag_position_test`'s
  `INSTANCE_WITNESS` had used the function-value leaf, which this PR builds. They now read
  `a?.m ?? (() => 2)`: [D3373](../inventory/D3373.md)'s `??` over a nullable function value, still
  open, refused at `lib.vl:7:29`.

## Proof

- **Witness:** D16036's moves from `emit_reject` to runs, printing `3`. The row is closed. D3373,
  D15155 and D15157 grade `emit_reject` as filed.
- **Position matrix:** `scripts/capability-probes/matrix/optchain-fn-leaf.matrix.vl`, whose proof
  calls the function: **0 → 66 of 66**, both faces, 0 `runs → not-runs`, 0 silent, 0 traps.
- **Test:** `tests/cases/expressions/optchain-standalone-fn-leaf.vl`, five cells: a hit, a null
  receiver, a capturing closure with an argument, a nested chain, and a `?.` argument. On the base
  seed the file is refused at emit.
- Sweep with fixpoint seeds on both sides: SWEEP.
- Render-parse census: CENSUS.
- `scripts/gate.sh`: all rows pass.
