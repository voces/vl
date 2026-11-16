## Type system (Track A)

- **D16867 closed:** an alias of a re-pointed `let` of a record literal (`b = a; const v = b`), delivered to a union of records such as `Node | null`, runs. The alias is delivered as the binding's own read is, so the written record and the initialiser share one layout.
