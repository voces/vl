## Type system (Track A)

- **D3040, D3056 closed:** a list the program writes, delivered where a `readonly` list of another element storage is declared (`i32[]` into `readonly i64[]`, `Circle[]` into `readonly Shape[]`), is the live view that reads through the source, so a later write shows. The 2026-09-06 `readonly` ruling defines it that way, and the converting views it needed (D3028, D3041) now exist. A call result with no named root, and a list of scalar lists into a `readonly` union list, stay refused.
