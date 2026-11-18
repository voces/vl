## Type system (Track A)

- **D3172 closed:** `??` over a string literal set narrowed out of a wider union box (`e: K | null | i32` past `!(e is i32)`, then `e ?? "b"`) runs, where it was refused at emit.
- **D16959 filed:** a generic call whose list parameter is handed a union of list types leaves its type parameter open, so its result is accepted at any destination.
