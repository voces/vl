## Codegen, memory & runtime (Track B)

- **IR cutover C2k, a one-argument list push:** `xs.push(x)` onto an i32 or string list, held in a
  local or staged from a global, goes through legacy's own plan and tails in the IR (`pushPlanOf`,
  `listOpRecvHeld`, `stageListRecvTail`, `pushValueTail`, `pushAppendTail`). The IR covers 382 more
  self-compile functions, every lowered one matched. No emitted byte moves.
