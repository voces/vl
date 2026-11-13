## Type system (Track A)

- **Step 7: a generic instance's union annotation whose substituted spelling names no type is typed at the substitution.** `monoSubstLetType` used to leave such an annotation untyped, so the `let` skipped its union box. This closes the two arm-at-instance traps the opaque-label instrument raises (D15042, `union-of-records-arm-holding-type-param-built-at-instance`). Byte-identical over the sweep.
