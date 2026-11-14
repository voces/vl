## Type system (Track A)

- **D16150 closed:** a generic whose parameter is a union of records over `T` (`{ leaf: T } | { kids: T[] }`)
  binds `T` from a union-of-records argument, in either arm order, and an `is` or `match` naming
  `T` narrows to that arm.
- **D16151 closed:** a generic over a recursive generic union alias (`Tree<T>`) calls itself on each
  element of its narrowed list arm.
- **D16110 closed:** `===` in a generic passed as a value is refused at the enclosing call's argument
  that has no identity, as a direct call is.
