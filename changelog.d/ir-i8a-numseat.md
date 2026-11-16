## Codegen, memory & runtime (Track B)

- **IR I8a, the numeric coercion seat retires:** a number widened at a declaration, assignment,
  return, element store or push goes through the IR as `RNumWiden` and legacy's own
  `widenPlanOf` and `numWidenTail`, and legacy's `numSeat` is gone. A folded module constant reads
  through `emitFoldedConstRead`. The IR covers 1,758 more corpus functions, every one matched. No
  emitted byte moves.
