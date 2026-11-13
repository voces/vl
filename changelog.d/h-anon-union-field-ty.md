## Type system (Track A)

- **Step 7: a record literal's union field mints its box from its type.** `anonMintRowFor`
  passes each union field's type to a new `registerAnonUnionField`, which mints through the
  typed seam (or from the type itself when no spelling twin exists). Before, the rendered name
  was parsed back through `declTyIxOfName`'s `resolveAnnot` rung. `registerValueUnionName`,
  that path's only entry, is gone.
