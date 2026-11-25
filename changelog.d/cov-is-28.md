## Codegen, memory & runtime (Track B)

- **IR claims a nullable name compared with an assignment of `null` on the right** (`z == (n = null)`), where the store can be written first without changing the answer: another name, an effect-free value.
