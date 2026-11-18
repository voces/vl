## Type system (Track A)

- **D16983, D16985 closed; D16984 now the designed check refusal:** an empty list's element type is fixed by a read delivered to a typed destination (an annotated `let` or a typed assignment), wherever the list sits: a record field, an inferred `[]`-or-`null` or `[]`-or-string result, an `__array_new_default__` list. These were check-clean invalid wasm, settled at the `i32` default after the read was checked. Two uses that disagree are refused at check.
