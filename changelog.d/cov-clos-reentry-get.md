## Codegen, memory & runtime (Track B)

- I8 re-entry port (lane COV-CLOS): a `.get` index that legacy's `.get` head reads again, in a fused `xs.get(i) ?? d` or a checked `.get`, is now the IR's own operand, handed to the head through `listGetIdxHook`, and no longer lowered through the expression emitter. The output is byte-identical to before.
- I8 re-entry port (lane COV-CLOS): the receiver of a fused `xs.get(i) ?? d` that legacy's `.get` head reads again (when nothing staged it) is now the IR's own operand, read again through `listGetRecvHook`, and no longer lowered through the expression emitter. The I8 sweep's `reentry emitListGetRecv` cause is gone (18 programs reached it).
