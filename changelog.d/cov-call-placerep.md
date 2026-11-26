## Codegen, memory & runtime (Track B)

- **IR reads a map local at the row it is stored at:** a `Map()` local whose record value only widens through a later view, such as `{[string]: J}`, is held at the map type its cell plan stores (`letMapShapeOfTy`). The IR builds the `Map()` there, and each read follows that row: the local itself, a bare `get` under `?.` or `??`, a local bound to a `get` and narrowed past `null`, a `values()` walk, and an argument. Before, these reads asked for the checked type's row and missed (`convert map -> map`, 5 functions in the two witnesses -> 0).
