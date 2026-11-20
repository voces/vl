## Codegen, memory & runtime (Track B)

- **IR: an index into a string literal:** `"..."[i]` is built by the IR, its receiver the literal written at its use as legacy writes it; the bounds rule pairs a check and a read only on the same literal node. 29 more self-compile functions are built by the IR.
