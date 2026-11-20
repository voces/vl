## Codegen, memory & runtime (Track B)

- **IR coverage:** `x ?? d` over a nullable record, union arm, collection or function value held in a local is built by the IR through legacy's `br_on_non_null` block, the operand read once and the default only on `null`; legacy's four sites read one heap decision (`coalNulRefHeapOf`).
