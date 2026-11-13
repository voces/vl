## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono, P6: a `T[]` parameter's pin is spelled from its element type.** Before, the pin was built by reparsing the element's spelling. All 664 programs that reach it build byte-identical. A `T` bound only by an explicit type argument's spelling (2 programs) keeps its spelling.
