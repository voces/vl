## Infrastructure (Track F)

- The IR fills a capturing nested function's function-value cell (D7700) from the frame's own
  operands where a capture is a local binding of that frame, which legacy's fill finds only
  through its emitter's scope (`closure env capture` → 0; lane COV-CLOS).
