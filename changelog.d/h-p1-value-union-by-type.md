## Type system (Track A)

- **Step 7: value-union-ness is asked of the type at four emitter sites that parsed a render.** `collectARefArrayAnn` and `fnRetNullBearing` read `valueUnionTyVerdict` and parse the name only where the type declines. `ifExprNliName` and `valueUnionNameOfSoftTy` decide from the atom kinds they already hold. Byte-identical over the sweep, and two render-parse sites are gone.
