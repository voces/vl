## Codegen, memory & runtime (Track B)

- **D15753, D15755 closed:** an un-annotated function returning a held list of un-annotated
  functions, or a value `if` of two held maps of them, runs where its result is bound at an
  annotated type, instead of being refused at the return.
