## Type system (Track A)

- **D16338 closed:** a `?.` read on an un-annotated parameter handed `null` takes its `??` fallback (`function take(a) { print(a?.f ?? 0) }`, `take(null)` prints `0`). Emit used to refuse it with "`??` over this nullable value is not supported yet".
- **D16856 closed:** `print(a?.f)` on an un-annotated parameter handed a record with a string field prints the string; it used to build an invalid module.
