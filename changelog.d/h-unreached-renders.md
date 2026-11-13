## Type system (Track A)

- **Step 7: three unreached type-to-name renders go.** `arrLitElemName`'s
  frame-typed path fails loudly, and `memReadBoxNarrowName` and
  `fieldTypeRefusalMsg` are deleted; a probe over the sweep found none of them
  reached while their enclosing functions ran. Byte-identical over the sweep.
