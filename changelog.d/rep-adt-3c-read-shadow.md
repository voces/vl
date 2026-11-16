## Infrastructure (Track F)

- **Rep ADT stage 3c-i:** every field-code read goes through one reader, `fieldCodeIn`. Under
  `$VL_REP_SHADOW` the reader compares each read with the code the row's storage type derives.
  On `tests/cases` and `std`, 1,016 of 411,687 reads disagree, in three classes: function-set
  fields, closure fields, and an empty list joined with `null`. A generic template's own rows,
  which 3a took to be unread, are read too. 0 module bytes change:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3c-read-shadow.md`.
