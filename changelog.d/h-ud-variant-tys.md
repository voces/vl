## Type system (Track A)

- **D16052: a declared union's variants match its row by type.** `collectDeclaredUnion` reads
  member types through `unionTyMemberTys` instead of `unionTyArms` atoms. `declVariantPos`
  places a variant on the row member of its type instead of its spelling. An expanded nullable
  member's arms are named from the row's own atoms. Output is unchanged on the corpus.
