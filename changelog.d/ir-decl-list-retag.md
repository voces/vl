## Codegen, memory & runtime (Track B)

- **IR coverage: a record list bound at its record-or-`null` twin.** `const a: (C | null)[] = xs` over a `C[]`, or the reverse, is the same list: one ref list holds both, and legacy converts nothing where no coercion is recorded. The IR built the value at the initializer's list rep and missed at `declaration coercion`. `RRetag` now also relabels a ref list as itself (`listRetag`, one predicate shared by the verifier and the builder).
