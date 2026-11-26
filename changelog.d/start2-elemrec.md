## Codegen, memory & runtime (Track B)

- **IR claims a nested list store whose literal holds a record literal:** the element store no longer skips it. A shared `let` captured before its first assignment stores through that path, and the claimed build is byte-identical to legacy. `store element record literal` falls 2 → 0: `closures/shared-let-without-zero-value.vl` and `closures/shared-let-read-early-traps-nullable.vl` (`go`) are claimed.
