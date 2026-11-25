## Codegen, memory & runtime (Track B)

- **D17301 closed: a `??` over an assignment of `null` now runs**: `print((n = null) ?? "d")` stores `null` and prints `d`, for a local, a field, a number cell and a never-filled `let x = null`, in a chain or a binding. Before, it was the emit refusal "`??` over this nullable value is not supported yet".
