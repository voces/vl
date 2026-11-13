## Tooling

- **Step 7: the render-parse census counts every type-string parser the emitter calls.** Its parser set is every `tyname.vl` grammar export plus a checked list of the parsers outside it (`nameToTy`, `valueAtomKind`, `isValueUnionName`, `resolveAnnot` and others), and `check_emit_queries.vl` is in scope. A listed parser that no longer exists fails the census. The baseline moves from 1 to 149 type-string parses and from 8 to 13 renders: the same code, counted honestly.
