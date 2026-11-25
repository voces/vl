## Codegen, memory & runtime (Track B)

- I8 re-entry port (lane COV-CLOS): `arrLitDataElemEmit`, the element writer that the IR's long literals and hoisted `for` literals call, no longer lowers a constant element through legacy's expression emitter. A number, a negated number, a boolean, or a tagged set's member is written by its literal alone, byte-identical to before.
