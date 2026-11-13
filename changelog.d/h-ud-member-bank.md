## Type system (Track A)

- **Step 7: declared-union members read the checker's own resolution.** The
  emitter re-parsed each declared union member from a spelling canon had already
  rewritten (a generic application's body, a softened literal tag). The checker
  now banks the type it resolved each member to, and `collectDeclaredUnion` and
  `declArmsMatchRow` read the bank; a member with none fails loudly.
  Byte-identical over the sweep.
