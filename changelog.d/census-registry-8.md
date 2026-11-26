## Codegen, memory & runtime (Track B)

- **I8 owner registry (regen-12):**
  - `assignment value unwiden rep` → START-2. Coordinator ruling: it is one mechanism with START-2's `assignment value unwiden of a recovered read`, legacy's non-null cast after an already non-null value.
  - `store of a map entry write` → CENSUS (#10434).
  - CENSUS takes the two largest unowned classes, `convert null -> i32` and `convert record -> nullable`.
