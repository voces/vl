## Codegen, memory & runtime (Track B)

- **IR B2, a narrowed box's field read:** the IR builds `u.f` where `u` is a union box local
  or parameter narrowed to one record variant, through the predicate and writer legacy's
  `emitNarrowedMem` now shares. The self-compile ships 1,324 more functions from the IR and the
  corpus 3. No emitted byte moves.
