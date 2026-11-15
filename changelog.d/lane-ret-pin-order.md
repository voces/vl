## Type system (Track A)

- **D16451 closed:** a generic function's `return Map()` grades the empty map before pinning it
  from the declared result, as its tail does, so each instance takes its own value type.
