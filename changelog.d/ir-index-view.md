## Codegen, memory & runtime (Track B)

- **IR coverage: a list read that may be a view.** A scalar or ref list read whose list may be a view of its source reads through the view, by legacy's shared read tails (`scalarListGetTail`, `refListGetTail`).
