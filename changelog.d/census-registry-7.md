## Codegen, memory & runtime (Track B)

- **I8 owner registry:**
  - **Coordinator rulings (regen-11):**
    - `object field coercion`, `object field arm unbox`, `object field holder` and `object field nulStrAtom` → COV-CLOS.
    - `store short-circuit operand` → COV-UNION.
    - The new lowering decline `slotless local at a rep with no valtype` (`fallback:`) → COV-START.
  - **CENSUS takes the unowned tail:** `map get union box rep`, then `box of an effect's immediate`.
