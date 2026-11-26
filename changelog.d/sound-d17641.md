## Codegen, memory & runtime (Track B)

- **D17641 closed:** a kept maker's call in a list handed to a generic identity, beside its own type's instance, no longer builds invalid wasm. The instance is keyed at the row the list is built at, and a read of the call takes the instance's result type.
