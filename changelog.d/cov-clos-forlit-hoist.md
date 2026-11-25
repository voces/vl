## Codegen, memory & runtime (Track B)

- I8 re-entry port (lane COV-CLOS): a `for e in [x]` literal whose element reads a frame local is no longer lowered through the expression emitter just to learn that it is not one constant. The module-list hoist now declines it up front. The output is byte-identical, and the I8 sweep's `reentry arrLitDataElemExpr` cause is gone.
