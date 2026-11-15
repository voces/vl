## Type system (Track A)

- **D16565 closed:** a `for` over `.values()` or `.keys()` of an un-annotated map or set parameter binds its loop variable to the hole a key-value walk would, instead of reporting it as an undeclared identifier. A body that pins the map runs, the map written after the loop included; a read-only body meets only the map-parameter floor.
