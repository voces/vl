## Type system (Track A)

- **Step 7: `identFnTypeAnnNameOfRead` answers a boolean.** All four callers
  used its rendered binding name only to ask "is this binding function-typed",
  so it is now `identReadIsFnAnnotated`. The dead `ann` name thread it fed
  through six monomorphizer delivery functions — each already reading the type
  beside it — is removed. Byte-identical over the sweep.
