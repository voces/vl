## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** `unionSetAtomsOf` and `unionSetAtomsOfTy` are deleted, the last union spelling split: the union `==` staged compares take the union's type and read arm types off it, a row-less union answers from its own member set, and a type-less ask is a loud floor. Two programs reorder their type section; no output moves.
