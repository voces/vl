## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** three emitter sites that parsed a primitive's name to get its union-box kind (`memReadBoxedAtomKind`, `memReadCheckerAtomKind`, `njKindOfTy`) now read it from the type with `boxTagOfTy`. No output moves.
