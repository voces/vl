## Codegen, memory & runtime (Track B)

- **IR B1, a box's `is` test:** the IR builds a union box's local, parameter or result, and its
  `is` test of a record variant where legacy's ladder answers by the tag alone, through the
  same shared decision; the new `box` family is claimed. The self-compile ships 347 more
  functions from the IR and the corpus 592. No emitted byte moves.
