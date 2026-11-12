## Codegen, memory & runtime (Track B)

- Step 7 L6: the inline union registrar registers a value union by the name its type spells (`registerValueUnionOfTy`), not the caller's rendering; a union spelled in another member order or through an alias joins the row its type names.
