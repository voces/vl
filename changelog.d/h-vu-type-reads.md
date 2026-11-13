## Type system (Track A)

- **Step 7: five more value-union questions ask the type they already hold.** `unionNameOfCall`, `asgReadNarrowTy`, `anonNullFieldBox`, `registerCloResultUnion` and `sharedFieldArmValueBox` ask `valueBoxOfTy` instead of parsing a name rendered from that type. Byte-identical over the sweep.
