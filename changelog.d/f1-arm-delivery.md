## Codegen, memory & runtime (Track B)

- **IR: a nullable record field takes its value:** an object literal's `X | null` record field is built as its value delivered at the field's rep wherever `emitArmDelivery` owes no unbox (`narrowedArmNeedsUnbox` false), which is legacy's plain emit; an arm narrowed out of a union of records, which arrives boxed, stays the named miss `object field arm unbox`.
