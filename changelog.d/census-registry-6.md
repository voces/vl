## Codegen, memory & runtime (Track B)

- **I8 owner registry:**
  - **Closed:** `open local type` by #10375, `for in stored-row receiver` by #10384, `map read scalarBox` by #10392.
  - **Coordinator rulings:**
    - `if arm coercion` → START-2, by route (a): the checker closes an anonymous record field's unfixed element to i32.
    - `map store value union rep` → START-2.
    - `bundle result pick refused` → COV-CLOS.
    - `coalesce nulRef result rep` → COV-UNION.
    - `convert record -> closure` → COV-CALL.
    - The 8 `global initializer coercion` map → map units → COV-CALL.
  - **START-2's claims registered.**
