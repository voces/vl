## Codegen, memory & runtime (Track B)

- I8 re-entry port (lane COV-CLOS): a `.get` index that legacy's `.get` head reads again, in a fused `xs.get(i) ?? d` or a checked `.get`, is now the IR's own operand, handed to the head through `listGetIdxHook`, and no longer lowered through the expression emitter. The output is byte-identical to before.
