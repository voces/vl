## Codegen, memory & runtime (Track B)

- **IR builds an annotated binding of a bundle holder's read** (`declaration coercion`). A binding whose type names one closure, initialised with a read of a holder that keeps a hole-function's instances as a record, takes that member off the record, as legacy's `emitTypedHolderInit` does (the new `RHolderPick`). The verifier refuses a pick of a non-record or into a non-closure; keyed self-tests pin both sides.
