## Infrastructure (Track F)

- **Rep ADT stage 3c-i:** every field-code read goes through one reader, `fieldCodeIn`. Under
  `$VL_REP_SHADOW` the reader compares each read with the code the row's storage type derives.
  Over the distilled corpus, 28 of 183,686 reads disagree, all on a generic template's own rows,
  which 3a had taken to be unread. 0 module bytes change:
  `docs/internals/refactor-notes/2026-11-16-rep-adt-stage3c-read-shadow.md`.
