## Codegen, memory & runtime (Track B)

- **Step 7, the shape walk by type:** interning a type's inline shapes walks the type itself. It keys each node by its nominal name or render, or, for a record of tagged-set ids, by the spelling it is stored as; it no longer peels the spelling. Identity on the corpus.
