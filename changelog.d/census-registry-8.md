## Codegen, memory & runtime (Track B)

- **I8 owner registry (regen-12):**
  - `assignment value unwiden rep` → START-2. Coordinator ruling: it is one mechanism with START-2's `assignment value unwiden of a recovered read`, legacy's non-null cast after an already non-null value.
  - `store of a map entry write` → CENSUS (#10434).
  - Regen-12's 69 unowned classes (83 units) are routed by mechanism family, per the coordinator:
    - `convert …` → COV-CALL
    - `local rep …` → COV-START
    - `is …` and `box …` → COV-IS
    - coalesce, short-circuit and compare → COV-UNION
    - lambda and closure → COV-CLOS
    - global, if, assignment and operand → START-2
    - map, store and the rest → CENSUS
