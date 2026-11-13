## Codegen, memory & runtime (Track B)

- **Step 7 L6, `variantIndexOf` deleted:** its 12 readers find a variant row by type: the arm row of the declared identifier's type, or the field's own type. The name-to-row sid index and both of its writers go with it. Variant name producers: 1 → 0. Identity on the corpus except 2 programs whose type section swaps two function types.
