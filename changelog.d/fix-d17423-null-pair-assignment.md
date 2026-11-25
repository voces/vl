## Codegen, memory & runtime (Track B)

- **D17423 closed:** a `null`-typed compare with an assignment of `null` on a side (`(s = null) == n()`) now runs instead of emitting an invalid module; the compare stores, runs each side left then right, and answers the constant.
