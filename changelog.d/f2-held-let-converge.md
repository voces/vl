## Type system (Track A)

- **D16958 closed:** a literal binding reaching an adopted list or map through a chain of assignments, pushes, index stores and map sets settles in one re-check, at any chain length; a chain past one link was refused at the checker's re-check budget.
- **D16960 filed:** an un-annotated parameter pushed onto a list of a record that stores a field differently is refused.
- **D16961 filed (clause 1):** a re-pointed `let` of a record literal returned from a function with an inferred result builds invalid wasm.
