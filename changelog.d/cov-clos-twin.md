## Infrastructure (Track F)

- The IR builds a named function value the checker coerced to `() => void` as its void twin's
  closure, as legacy does, at a global's initializer and at any delivery (`closure value twin`
  → 0; lane COV-CLOS).
