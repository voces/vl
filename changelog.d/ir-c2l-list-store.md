## Codegen, memory & runtime (Track B)

- **IR cutover C2l, a list element store:** `xs[i] = v` onto an i32 or string list goes through
  legacy's own plan, hoist and tail in the IR (`idxStorePlanOf`, `idxStoreHoistOf`,
  `idxStoreTail`), and the verifier's rule 8 pairs the bounds check with the write. The IR covers
  197 more self-compile functions and 16 more corpus functions, every one matched. A scalar-width
  store waits for the `numSeat` coercion seat. No emitted byte moves.
