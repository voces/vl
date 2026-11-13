## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** each union member's box code is read from its type (`boxTagOfTy`), not parsed from its rendered name, so one type has one code however it is spelled (D16050, D16051). The `K | null` widening's plain-string test and `isValueUnionOfSet`'s fallback now read the union's type; a union neither its set nor its type answers is a loud floor. No output moves.
