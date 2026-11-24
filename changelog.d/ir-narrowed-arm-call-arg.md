## Codegen, memory & runtime (Track B)

- **IR coverage:** a closure call whose parameter is a nullable union arm (`Circle | null`) takes its argument as legacy does: a value narrowed out of a wider box is unboxed to the arm, and an object literal, a `null` or a nullable list element is passed as it stands.
