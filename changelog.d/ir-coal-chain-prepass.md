## Codegen, memory & runtime (Track B)

- IR coverage: a `??` chain (`a ?? b ?? d`) is built by the IR from the re-associated links `coalChainsPrime` mints ahead of the function bodies, the same links legacy's `emitCoalesceGo` now reads; no byte moves (corpus `coalesce chain` 68 → 0, +17 functions with no blocker; +0.37% L2 fuel for the walk).
