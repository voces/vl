## Codegen, memory & runtime (Track B)

- **IR covers `.length` of a call whose result is an empty `[]` no use typed (lane COV-UNION):** the call is built first and its length read off the list its callee's result descriptor names, as legacy reads it (`member unsup` 5 → 0).
