## Codegen, memory & runtime (Track B)

- **IR coverage, a list's `.slice`:** the IR builds `xs.slice(start, end?)` over every list kind
  legacy's arm takes (`RListSlice`). It asks legacy's plan (`arrSlicePlanOf`) and calls its
  receiver and copy tails (`sliceRecvTail`, `arrSliceTail`), which `emitArrSlice` now calls too. No
  emitted byte moves.
