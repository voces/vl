## Codegen, memory & runtime (Track B)

- **One `==`/`!=` route.** Legacy's `==`/`!=` dispatch is now one decision, `eqRouteOf`, with 25
  arms in the old ladder's order. `emitBinExprNode` matches on it, and the IR's `listEqRouteOf`
  asks it rather than restating the ladder. The scalar map read and the null test decide before
  emitting. Legacy bytes are unchanged across all of tests/cases.
