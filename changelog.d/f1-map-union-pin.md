## Type system (Track A)

- **D16975 closed:** a union of maps handed to an un-annotated parameter reads `.has`, `.get`, an index and `.length` per map arm at its pin. One per-arm dispatcher now serves list and map unions, and the list-only length chain is gone.
