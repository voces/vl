## Infrastructure (Track F)

- **Rep ADT stage 3c-ii:** a field's code is now derived from its storage type's rep. Three
  named classes keep the stored code: rows at an unpinned hole or a type variable (D16720),
  function fields (D16721), and an empty list joined with `null` (D16722). Under
  `$VL_REP_SHADOW`, a moved code or a kept read outside those classes fails loudly. 0 module
  bytes change on either corpus:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3c-derived.md`.
