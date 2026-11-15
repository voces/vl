## Infrastructure (Track F)

- **Rep ADT stage 3a:** a default-off shadow (`$VL_REP_SHADOW`) compares each struct row field's
  stored code with the code its storage type's rep derives. 14,694 of 14,698 corpus field rows
  agree, and the 4 that do not are a generic template's open rows:
  `docs/internals/refactor-notes/2026-11-15-rep-adt-stage3a-shadow.md`.
