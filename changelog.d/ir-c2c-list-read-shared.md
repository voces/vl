## Codegen, memory & runtime (Track B)

- **IR cutover C2c, the list read is shared:** `emitIndex` dispatches on one arm decision
  (`idxArmOf`) that the IR also asks, and the scalar list read is one two-half arm that both
  emitters call around their own operands. The IR's copied ladder is deleted. The decision agreed
  at 21,861 self-compile and 24,006 corpus reads, and no emitted byte moves.
