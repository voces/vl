## Type system (Track A)

- **D16273:** a `for` over a list literal holding an empty list literal runs: `for x in [[]]`
  settles the inner list's element at scope close, as a binding of the literal does.
