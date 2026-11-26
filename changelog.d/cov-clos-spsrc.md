## Infrastructure (Track F)

- The IR builds a spread literal at its built type's list, where a fresh nested source typed at the
  destination's element (D4871) sets that list apart from the literal's own (`array spread source
  rep` 3 → 0, `array spread conversion` 3 → 1, 0 lost; lane COV-CLOS).
