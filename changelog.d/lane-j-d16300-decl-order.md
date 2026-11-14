## Type system (Track A)

- **D16300 closed:** a `??` whose default is a list literal of another storage (`xs ?? [1]` over
  `boolean[]`) joins both lists when a binding of the call comes before the function's declaration;
  the quiet return pre-pass no longer reads a missing element record as fitting anything. Filed
  D16301: moving function declarations after top-level code changes 318 corpus programs' outcome.
