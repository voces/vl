## Type system (Track A)

- **D17015 made loud:** a fresh `Map()` in a record a call returns, storing an un-annotated function its caller then calls, is refused at emit instead of building a module that fails to validate. The full fix is open.
