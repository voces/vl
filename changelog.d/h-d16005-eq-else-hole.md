## Type system (Track A)

- **D16005: an `==` test's `else` over an un-annotated parameter reads the parameter minus the
  literal.** A literal demand in that arm (`onlyGreen(p)` after `if p == "red"`) no longer pins
  the parameter itself, as the `is` complement already did not. The `!=` spelling, numeric
  literal unions and generic parameters follow.
