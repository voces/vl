## Type system (Track A)

- **D17208, D17209 closed:** a function returning an `if` that joins a binding inferred `null` with a record runs when a later assignment fills the binding with a wider record; its inferred return follows the fill. A call read before the fill is refused with the order that runs.
