## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono, P6: a record-list literal argument is pinned at its own type.** `monoArgTyNameRep` now hands back the literal's list type to key the instance, instead of only a suffixed element name that a later step parsed back into a type. All 85 programs that reach it build byte-identical. A literal whose element type is still open (8 decisions in 7 programs) keeps its element name; filed as D16022.
