## Type system (Track A)

- **D16341 closed, D16432 closed:** an unwritten `Map()` or `Set()` stored whole as a value of an unwritten map (`m["k"] = Map()`) takes the default with its holder at the scope's end, so the program builds and runs instead of an invalid module or an emit refusal.
