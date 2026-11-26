## Codegen, memory & runtime (Track B)

- **I8 owner registry:** `parameter rep unsup` closed by #10320; `string operand coercion` → COV-CALL; the three `records/built-record-*` `@start` units → COV-CALL after #10317 (`program:<path>@<unit>`); D17663's witness → COV-IS; `for range dynamic step`, `map store value atomStr` and `union if record join row` → START-2; `red.sh` routes a fallback by its reason (`fallback:<reason>`): `ref valtype with no interned shape` and D4645's witness → START-2.
