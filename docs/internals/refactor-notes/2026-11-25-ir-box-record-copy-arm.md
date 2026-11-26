# IR box ladder's record-copy rung (2026-11-25, lane COV-IS)

- **The miss**: `box ladder` where a record built at another row (a call's own `{v: i32}`, a name
  holding one) is delivered into a union whose arm it matches or lands on (`R | string`, `R = {v:
  f64}`). Legacy's `emitUnionCoerceRecord` copies it onto the arm's variant field by field, each
  number widened (`emitStructExprAsVariantBox`), and boxes it; the shared plan named no arm.
- **What landed**: `holeBoxPlanOf` gains a `recCopy` arm (the arm `unionArmVariantForStructExpr`
  matches, else `unionArmLandingForStructExpr`), after the struct-heap `rec` rung, for a value that
  bears no null and is no literal. Legacy reads `recCopy` as its ladder (`unionBoxArgLadders`), so
  its bytes do not move. The IR writes the arm's tag, the value, the copy (`variantCopyEmit`, a
  source the copy re-reads captured as the IR wrote it, as `RRecCopyPure` does) and the box.
- **Parity**: `soundness/record-fresh-call-into-union-destination.vl` and the sweep read `matched`
  under `VL_IR_SHADOW=2` (byte-identical).
- **Q58 position sweep** (`tests/cases/records/record-copied-onto-union-arm-positions.vl`, new): a
  three-field record (`f64`, `i64`, `string`) at a global, a `let`, a return, an argument, a name
  source, an assignment, an if arm and a record field. Before: 7 functions and the start body are
  this miss; here all 9 and the start body are claimed.
- Left: a list literal of such calls (`[mk3(), mk3()]` into `(R | string)[]`) is `node-in array:
  miss fragment rep`, another class.
