## Codegen, memory & runtime (Track B)

- **IR coverage: closure thunks.** A function taken as a value without an env parameter gets its table thunk from the IR (`buildThunk`, claimed through `claimable()` and shadowed like a body, `thunk matched`): the env parameter ignored, the target's parameters forwarded, one tail call, as legacy's `emitCloThunkCode` writes it. A thunk whose target has an open parameter type stays legacy's.
