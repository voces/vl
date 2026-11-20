## Codegen, memory & runtime (Track B)

- **IR: `__array_new_default__`, `fromCodePoints` over a global list, and an atom pushed into a string list.** `__array_new_default__(n)` is `RListNewDefault`: the length, then legacy's zeroed allocation (`arrNewDefaultTail`). `fromCodePoints(xs)` over a global reads the global twice, as legacy does, through the builder's `irReadAgain` (`irLReadAgain`). A push of an atom into a `string[]` or `(string | null)[]` decodes it at the push, as `emitStrValue` does (`push atom`).
