## Infrastructure (Track F)

- **Rep ADT: the variant axis no longer rebuilds the rep tree during emit.** A whole reset of the
  variant table re-adds the same checker and elaboration bits, so only a bit new to the program
  drops the tree. Corpus rebuilds after the passes phase fall from 26,494 to 1,500, with 0 module
  bytes changed: `docs/internals/refactor-notes/2026-11-15-rep-adt-stage2-gate.md`.
