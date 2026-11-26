## Codegen, memory & runtime (Track B)

- **I8 owner registry:**
  - **Coordinator rulings (regen-11):**
    - `object field coercion`, `object field arm unbox`, `object field holder` and `object field nulStrAtom` → COV-CLOS.
    - `store short-circuit operand` → COV-UNION.
    - The new lowering decline `slotless local at a rep with no valtype` (`fallback:`) → COV-START.
    - `box of an effect's immediate` → COV-IS. The builder detaches the immediate from its effect node; rule 2 stays as it is.
    - `string operand after another` → START-2.
    - `map store value variant box` → COV-CLOS.
  - **CENSUS takes the unowned tail:** `map get union box rep`.
