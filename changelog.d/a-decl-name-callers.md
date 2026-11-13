## Type system (Track A)

- **The mv value rows and their twin identity read the held type, not a parse of the value's name (step 7).** `mvShapeOfMapHeldTy` hands down the value type it renders the name from, and the row bank records a rewritten spelling's own type. The name fallbacks in `mvValTyIxOfNameRow` and `mvValTwinCanonId` are deleted. `repSlotOfElemTy` and `rlDeclTwinTy` are graded as source-only: they read a declaration's own name.
