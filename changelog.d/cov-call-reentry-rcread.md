## Codegen, memory & runtime (Track B)

- **I8 re-entry: a record copy's source is the IR's own read.** Legacy's whole copy now reads its source as the bytes the IR wrote, either the value read once or a name's read written again, instead of through `emitExpr`. The I8 sweep's `reentry rcReadSource` falls from 310 programs to 0.
