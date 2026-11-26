## Codegen, memory & runtime (Track B)

- **IR: two I8 stub edges closed, two proven:** a `for` iterable literal with an element no constant writes builds as usual, never asking legacy's hoist (`hoistInRangeCopy` deleted; `arrLitHoistGlobal`, `forLitHoistPlan` leave the I8 keep list); the long-literal data path declines a literal one of whose elements is no constant leaf (`arrLitDataAllLeaves`), so `arrLitDataElemExpr`'s expression arm is no longer reached from the IR; `emitStrValue`'s two edges are recorded proven (`edges-proven.txt`).
