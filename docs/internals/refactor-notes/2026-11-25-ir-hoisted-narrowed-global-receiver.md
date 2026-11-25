# IR hoisted loop receiver: a global narrowed out of a union box (2026-11-25, lane COV-IS)

- **The miss**: `hoisted receiver read` where the hoisted receiver (`irHoistRecv`) is a global
  read through a narrowing unbox (`globalUnboxRead`). #10127 closed a local's; a global's unbox
  reads a box temp (`globalBoxAt`), which the hoist cannot read again, and recorded nothing.
- **Where it bit**: INFRA's I8 regeneration 6 counts 15 `hoisted receiver read` refusals, among
  them the std int_text, float_text, json and base64 tests, whose probes walk a module-scope
  `readTextFile` result narrowed past `IoError` in an `else` arm.

## What landed

- **The builder**: `globalUnboxRead` records its atom unbox (`irReadAgain`) where it leaves `rep`.
- **The lowering**: `irLReadAgain` writes such an unbox's box as the global read that defines the
  box temp (`globalBoxDefOf`, found in the body: the hoist is written before that definition), then
  the unbox tail; `irLSkip` skips an unbox's box with it, as it skips a field read's receiver.

## How it was measured

- **The class**: the int_text test's probe (`readTextFile`, the `IoError` arm, the line walk) and
  a minimal witness match under `VL_IR_SHADOW=2` (master: `mismatch start unlowered: hoisted
  receiver read`).
- **Q58 position sweep** (`tests/cases/unions/narrowed-global-list-hoisted-loop-receiver-positions.vl`,
  new): an else arm at module scope with an inner loop's condition, an `i32[]`, a function's early
  return over the global, and the error arm. On master its function and start body are this miss;
  here all match.
