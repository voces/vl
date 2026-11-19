## Codegen, memory & runtime (Track B)

- **IR coverage, a map global's `.has`:** the IR builds `g.has(k)` on a map global read plainly
  (`RMapHas`), through the probe and hit-flag tail it now shares with legacy's `emitMapHas`
  (`mapHasTail`). The self-compile ships 97 more functions from the IR. No emitted byte moves.
