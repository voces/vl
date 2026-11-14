## Type system (Track A)

- **D1198 closed:** a recursive JSON shape (`type Tree = { v: f64, kids: Tree[] }`) on the right of
  a deep `is` is walked by a call per level instead of being refused; a cycle through no list,
  map or `null` is refused as having no finite value.
