## Codegen, memory & runtime (Track B)

- IR coverage, omitting variant literals and re-laid literal sets (lane IR-M1). A variant literal that leaves out a field its arm may omit is built at the arm's row with that field's `null`, and a literal-set field a layout family re-lays at the string reps there. `object layout` rows 7 → 0 on tests/cases, const-cell misses 13 → 9.
