## Type system (Track A)

- **A call argument holding a tagged set in a record or map field, not only a list, binds its hole parameter at the set:** `elabCallArgSetTy` tests the argument with `fnTagHoldsTy` (list, record or map, at any depth) in place of the list-only `fnTagListTy`. It is the one function both the held-set instance key (D15900) and the map-of-`V` instance (D14433, D17014) key through.
