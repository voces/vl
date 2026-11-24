## Codegen, memory & runtime (Track B)

- **IR: an assignment of `null` used as a value builds in the IR**: the store, then the literal's own null, as legacy writes it (`assignment value nullLit`, 24 functions on master's census). An unannotated `null` binding of such an assignment stays a named miss pending D17088.
