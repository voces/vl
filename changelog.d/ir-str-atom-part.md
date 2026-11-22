## Codegen, memory & runtime (Track B)

- **IR coverage: a narrowed literal-union read as a string part.** A string `+` or compare whose
  part reads a literal-union binding narrowed past its other members (for example, the last
  `else` of a ladder over its members) builds through the IR, decoded off the binding's atom cell
  as legacy writes it.
