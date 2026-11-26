## Codegen, memory & runtime (Track B)

- **IR stages a binary operator's left operand below a right operand that holds a valued `if` (lane COV-UNION):** a union compare, a list compare, a list concat and a `boolean | null` compare now stage it as the arithmetic operators already did, through one helper (`stageLeftBelow`), instead of refusing (`short-circuit right operand` 8 → 4 rows on its regen-9 programs).
- **IR stages an atom compare's left operand below a `??` on its right (lane COV-UNION):** `"a" == (s ?? "b")` stages the literal's member id and `t == (s ?? "b")` stages the variable, where both fell back (`operand above a valued if's value`, D17244).
