## Codegen, memory & runtime (Track B)

- **D17663 closed:** a map cell written in an `is` branch, written again and tested for its member no longer builds invalid wasm under strict IR; the IR also boxes a coalesce of nullable records into an annotated union at the union its destination holds, and tests an `is` over a list element or map cell by its box.
