## Type system (Track A)

- **Step 7: a declared union's function member is grouped by its type, not its spelling.**
  `collectDeclaredUnion` reads the member's banked type (`TyFunc`) to decide the grouping parens
  in the member set, instead of parsing the member spelling with `nameIsFuncTypeAtom` and
  `peelGroupParens`. Two render-parse sites close.
