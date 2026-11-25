# A `.push` whose value stages a receiver of its own (2026-11-25, lane COV-START)

`xs.push(src.pop() ?? 0)` with `xs` a module global (D1280). The value runs a list op that parks
its receiver in the frame's one `recvRef` slot. So legacy writes this push's value first and
stages its own receiver after it (`emitPushOne`'s `lateStage`). The builder took that order only
for a receiver held in its own local. Every other receiver missed as `push late receiver`.

## The mechanism

- `pushLateRhs` (`ir_build.vl`) builds the value at the receiver's element rep, then the
  receiver.
- `lowerPush` (`ir_lower_ref.vl`) writes them in that order: the value into the push slot, then
  the receiver staged into `recvRef`, then the append. These are legacy's tails.

## Measured

The class's own programs, armed shadow (`$VL_IR_SHADOW=1`), master → head:

| program | master | head |
|---|---|---|
| witness D1280 | start uncovered `push late receiver` | start matched |
| `scripts/capability-probes/push-value-position.vl` | start uncovered | start matched |
| `tests/cases/lists/push-yields-new-length.vl` | start uncovered | start matched |

The sweep `tests/cases/lists/push-late-receiver-positions.vl` covers:
- receivers: a global, a field, an element, a nullable element list, the same list as the value's
  receiver, and a push value;
- in a start body and in a function.

It prints the same lines on legacy and under `$VL_IR_STRICT=1`. Its start body and both functions
are matched. On master the start body and one function missed.
