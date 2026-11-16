## Infrastructure (Track F)

- **Rep ADT 4b, heap shadow by class** (`refactor-notes/2026-11-16-rep-adt-stage4b-shadow-classes.md`):
  the `$VL_REP_SHADOW` heap sweep compares a field's element by rep id, reads a merge against
  today's heap key, and names each kept-apart merge's class: 45 struct merges over the corpus
  (18 discriminating arm row, 5 function field, 22 hole or generic instance, 0 unnamed);
  unarmed, 0 of 8,379 modules move.
