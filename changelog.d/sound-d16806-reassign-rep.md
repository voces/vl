## Type system (Track A)

- **D16806's re-pointed face runs again:** a `let` of a record whose field is a list of lists of un-annotated functions, reassigned a record literal, builds the written literal at the binding's rep as #8694 builds the initialiser. #8694 had left that program check-clean but building invalid wasm. Its two matrix cells join `distilled/named/` as `d16806-record-lists-reassigned`.
