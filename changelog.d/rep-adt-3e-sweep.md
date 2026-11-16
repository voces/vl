## Infrastructure (Track F)

- **Rep ADT stage 3e, first piece:** 3a's end-of-emit field-code sweep is deleted (−97 lines). The
  read-time shadow in `fieldCodeIn` checks every read and fails loudly on a moved code. The rest
  of 3e waits on D16720, D16721 and D16722:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3e-sweep.md`.
