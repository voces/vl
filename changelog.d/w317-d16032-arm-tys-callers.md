## Codegen, memory & runtime (Track B)

- **Step 7, D16032: the closure-arm coerce reads its arm by the union type.** `unionClosureArmTyOfTy` returns the closure arm's type through the type-keyed `unionArmTysOfTy`, replacing a name lookup made twice (`unionClosureArmName`, then `cloBoxArmTy`). `cloBoxOwnFnTy` keeps the carrier's own function type first. All 58 programs that reach the site build byte-identical.
