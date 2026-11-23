## Codegen, memory & runtime (Track B)

- **IR coverage: a module binding holding a returned bundle's member or record.** A global's cell type now follows the binding's holder fact, as a local's already did: the record held whole (`holderRecordTy`), or the one closed member it holds (`holderMemberTy`), through `globalHolderTy`. A read where the type leaves a variable open is then the member's closure as the cell holds it. 3 of the 7 `open temp type` start bodies in tests/cases are covered and matched. Legacy's bytes don't change.
