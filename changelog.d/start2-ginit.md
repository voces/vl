## Codegen, memory & runtime (Track B)

- **IR claims a global bound to an empty-list-or-null join whose element nothing fixes:** the cell is the nullable `i32` list legacy declares for it, and a value `if` whose own type has no rep is built at its destination. `global initializer rep` falls 2 → 0 (`arrays/empty-list-join-null-hole.vl` and D6120 are fully claimed). The `null` arm is the bottom ref where legacy writes the cell's typed null, and both print the same.
