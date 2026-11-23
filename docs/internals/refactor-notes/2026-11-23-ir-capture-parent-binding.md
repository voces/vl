# IR capture: no parent binding (2026-11-23)

Lane IR-N8. `capTyOf` asks `parentBindingOf`, which knows parameters and `let`s of the frame
that owns a capture. Two capture shapes fell through it.

- A loop variable has no declaration type. `capRepFor` took a read's rep, but a frame that only
  forwards the capture to a sibling never reads it. `capLoopTyOf` types it as legacy's
  `captureLoopVarIterOf` does: a `for-in`'s element (`forInElemTyOf` in the loop's frame), or a
  range's i32 counter. A `for-in`'s second name stays a miss.
- A closure inside a generic or hole instance capturing that instance's parameter: the binding
  frame lookup does not reach the instance. When the capture is the building frame's own
  parameter, `cloEnvOf` holds it at that parameter variable's type.

Both go through `capRepAtTy`, the existing valtype check against legacy's `captureValKind`.

Witness: `tests/ir-shadow-rows/capture-loop-forward-and-instance-param.vl` (7 → 11 matched).

## Remaining

In the family's tests/cases programs, 11 `closure env capture` misses remain. 7 are captures
through a shared cell (`#cell:N`, `capCellTargetOf`) and 3 are the `null` instance (#9663).

## Legacy tails the IR calls

- `fbValtype` (under `wTarget` to a scratch buffer), in `capRepAtTy`: legacy's capture valtype, compared and discarded. This PR moves the existing call out of `capRepFor`; it adds no new one.
