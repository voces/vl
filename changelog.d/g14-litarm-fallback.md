## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** whether a union carries a literal-union arm is now read from its member set, else from its type. The spelling fallback `unionCarriesLitUnionArm` is deleted, and a union neither the set nor the type answers is a loud floor. No output moves.
