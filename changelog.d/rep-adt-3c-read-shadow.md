## Infrastructure (Track F)

- **Rep ADT stage 3c-i:** every field-code read goes through one reader, `fieldCodeIn`. Under
  `$VL_REP_SHADOW` the reader compares each read with the code the row's storage type derives.
  On `tests/cases` and `std`, 1,016 of 411,687 reads disagree, in three classes (D16720,
  D16721, D16722): rows minted at an unpinned hole or type variable, which 3a took to be unread,
  function fields stored as a closure, and an empty list joined with `null`. 0 module bytes change:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3c-read-shadow.md`.
