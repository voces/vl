## Codegen, memory & runtime (Track B)

- **IR coverage:** `x ?? d` over a nullable record, union arm, collection or function value is built by the IR through legacy's `br_on_non_null` block, or, when the default joins into a union box, legacy's staged `if`, the operand read once and the default only on `null`; legacy's sites read one plan (`coalNulRefPlanOf`) and one join refusal (`coalNulRefJoinWhy`).
