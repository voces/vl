## Codegen, memory & runtime (Track B)

- **IR lowering declares a boxed-nullable local:** a slotless local at a boxed nullable rep (the `is` stash of a map read of a union value, `if p["k"] is AB`) is declared at its union box's nullable ref, as legacy declares it, instead of falling back with `slotless local at a rep with no valtype`.
