## Codegen, memory & runtime (Track B)

- **D17280 closed:** an intersection over a recursive record that is also in a union with another record no longer fails the IR verifier's rep check where it is retagged or returned. The IR types those temps at their delivery's own type, so its claim no longer falls back to legacy.
