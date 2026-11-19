## Codegen, memory & runtime (Track B)

- **IR coverage, a list's `.clear()`:** the IR builds a list `.clear()` statement (`RListClear`)
  through legacy's plan (`clearPlanOf`) and length reset (`clearLenTail`). It holds or stages the
  receiver as a `.pop()` does. Legacy's `emitClear` and its statement gate (`clearRecvIsList`) now
  call the same plan and tail, and a map's `.clear()` stays on legacy. No emitted byte moves.
