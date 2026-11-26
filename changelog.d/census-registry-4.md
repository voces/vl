## Codegen, memory & runtime (Track B)

- **I8 owner registry (regen-10):** `convert record/list/map -> …` (irConvert case (e)) and `if arm coercion` → COV-CALL; `box pass`, `box null`, `box field of a let list's element`, `assignment value nullLit rep` and `is literal member number` → COV-IS; five `coalesce …` classes and `map store value union rep` → COV-UNION; `global initializer coercion`, `operand at null` and two `assignment value …` classes → START-2.
