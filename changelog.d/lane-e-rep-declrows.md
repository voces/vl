## Infrastructure (Track F)

- **Rep ADT: declared rows no longer rebuild the rep tree.** A pending-row change drops the tree
  only where an answer the tree consumed moved. The self-build builds the tree once, and corpus
  rebuilds after the passes phase fall from 1,500 to 107, with 0 module bytes changed:
  `docs/internals/refactor-notes/2026-11-15-rep-adt-declrows.md`.
