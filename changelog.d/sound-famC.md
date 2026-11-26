## Type system (Track A)

- **D16845, D17045 closed (family C, C1):** a maker returning a hole lambda it creates, one call's value held and called at two signatures, returns the record of one closure per signature its holders call it at: held by a binding, captured by a closure, assigned, or returned whole by another function. The record is built in the IR; a maker one of whose calls is not so held keeps today's lowering. The template `maker-fresh-lambda-held-at-two-signatures.matrix.vl` runs 57 of 66 cells (from 37).
