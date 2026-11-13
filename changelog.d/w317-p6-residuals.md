## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono, P6: the last pin-list and element-name parses go.** A `T[]` parameter bound by an explicit type argument's spelling is now pinned at its argument's closed type. A slot's function-pin annotation is spelled from its parameter types, so `annSplitParams` and `monoSigPinsTop` are deleted. The unreached spread rung becomes a loud floor. All 1,627 programs that reach these sites build byte-identical.
