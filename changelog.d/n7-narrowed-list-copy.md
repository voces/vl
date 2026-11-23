## Codegen, memory & runtime (Track B)

- **Soundness: a union box narrowed to `L[] | null` and copied out** (a binding, an argument, a return, a field read) is now that nullable list. It used to write the box into the list's slot, check-clean invalid wasm, for every value-atom list element kind (D17086).
