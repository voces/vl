## Codegen, memory & runtime (Track B)

- **Refactor:** legacy's `o.v ?? d` over a value-union record field reads one plan (`coalFieldPlanOf`) and one refusal decision (`coalFieldRefusedWhy`, `coalFieldUnboxWhy`); a retag call that compared a type with itself, and so never ran, is deleted with its now-unused helper. Emitted bytes are unchanged.
