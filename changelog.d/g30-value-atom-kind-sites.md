## Codegen, memory & runtime (Track B)

- **Step 7:** wasmEmit's five unreached `valueAtomKind` parses (`valueKindIsPlainScalar`, `emitUnionConcreteNumCross`, `xrepElemEq`, `emitNumExactCastFrom`, `emitHoleNumAsOpt`) read box tags from types; NumCross's name fallback is a typed read behind a loud floor.
