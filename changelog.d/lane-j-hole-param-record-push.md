## Type system (Track A)

- **D16426 closed:** a call above an un-annotated function that writes an element into its parameter (`push`, `unshift`, `add`, `set` or a cell store) now checks that function first, so the body's records share the call's list fields as they do below the declaration. Before, the program built an invalid module.
- **D16424 closed:** by the same rule, `g([])` above an un-annotated `g` that pushes a record with an empty list field onto it runs. Before, the monomorphizer refused it.
