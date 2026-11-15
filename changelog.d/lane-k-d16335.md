## Type system (Track A)

- **D16334, D16335 closed:** a call through an un-annotated parameter bound to a declared
  un-annotated function, handed a lambda only that function's body types, takes the direct call's
  result: it reads back from a map, and a binding of another type is refused.
