## Type system (Track A)

- A `Map()` binding whose values one delivery builds at a wider record is refused, as a list
  literal's is, where it is returned from an un-annotated function or passed to a parameter
  annotated at its own type; both built invalid wasm.
