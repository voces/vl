# D15951: a shared cell's read narrowed to `null` delivers that null, 2026-11-12

#7598's first sweep ran 0 programs fewer but reported one new compiler trap: D15951 moved from
check reject to invalid wasm. The PR filed the row open as pre-existing. On master it was
refused by `judgeNullHoleDeliveries`. Under the flow-reads face the checker types the read
`null`, so the face reached the trap. This note fixes it in the PR.

## Mechanism

A `let` written after a closure captures it lives in a shared cell. `captureBoxRewrite` respells
the closure's read of it as `c[0]` (`cboxWalkIdent`), copying the narrowed-from type and noting
the name read as the node's source. `emitNullReadAtDst` was reached only from `emitIdentNode`,
and asked `ctxTyAt` of the node itself, which for the respelled read records nothing. So the
read pushed the cell's `i32 | null` union box into a `string | null` parameter.

## What changed

- `emitIndex` delivers a cell read (`cboxReadTy` has it) narrowed to `null` through
  `emitNullReadAtDst`, as `emitIdentNode` does.
- `emitNullReadAtDst` falls back to the destination of the node the read respells (`nodeSrc`).

## Measurement

Every program below was invalid wasm on the PR's tree and prints its want on this one:
the row's `.map`, a generic-free higher-order function, a stored lambda called before the fill,
a block-bodied callback, `.filter`, and a `string | boolean | null` destination. A stored
lambda called after the fill stays refused by the capture re-check.

`scripts/capability-probes/matrix/null-let-read-before-fill.matrix.vl`, the PR's seed against
the candidate: 0 runs → not-runs, 0 → silent, and `fn_body_capture` (annotated) moves from
SILENT to RUNS, so the matrix reads 38 of 46 graded cells run. The cells still not running are
`block_while` and `block_while_capture` (annotated; the loop head stays refused, as ruled),
`argument` (WRONG and an emit refusal, the same before and after) and the four `return_*`
cells whose template does not reach `x`.
