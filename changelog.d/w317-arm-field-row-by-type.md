## Codegen, memory & runtime (Track B)

- **Step 7 D6: a union arm's record field interns its row from the field's element type.** `armFieldStructRowMinted` interned the struct row a union-variant record field stores through `internInlineShapeTy`, keyed by the field's element name. It now uses `internShapeDeepTy` on the field's element type. Only one program in the population reaches it, where the two interns agree, and it builds byte-identically.
