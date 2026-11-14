## Type system (Track A)

- **D16275 closed:** an empty `Map()` or `[]` delivered to a recursive union holding `null` and a
  scalar, `const j: Json = Map()` among them, is built as its map or list arm instead of an
  invalid module.
