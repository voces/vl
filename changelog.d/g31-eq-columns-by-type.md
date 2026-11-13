## Codegen, memory & runtime (Track B)

- **D16052 (part):** a union box `==` reads its arms' tags from their member types; `armTyOfUnionTy`'s by-spelling lookup is deleted, and `emitListIsAcrossReps` / `boxRetagArmsOfTys` read `unionTyMemberTys`.
