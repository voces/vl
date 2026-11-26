## Infrastructure (Track F)

- The IR builds a spread group at a sub row (a record list beside `null`, a wider record list into a
  narrower one) as the list it is, copied at its own row as legacy's join copies it (`array spread
  sub row` 3 → 0, 0 lost; lane COV-CLOS).
