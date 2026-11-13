## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** the union registry's `unionSetAtomsOf` wrappers lose their spelling splits: their reached callers read member sets and banked kinds by type, unreached splits are loud floors, and `njKindsOfUnionName` is deleted. Byte-identical across the sweep.
