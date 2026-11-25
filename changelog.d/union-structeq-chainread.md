## Codegen, memory & runtime (Track B)

- **I8 re-entry: a record compare's place root is the IR's own read.** Before, legacy wrote the operand again through `emitExpr` at each field; now its chain read appends the bytes the IR wrote once. The I8 sweep's `reentry emitChainRead` falls from 42 programs to 0.
