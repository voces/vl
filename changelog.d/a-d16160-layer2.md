## Type system (Track A)

- **D16160 narrowed:** a bound list of records whose function field holds un-annotated functions with different results, called through in place and also handed to an un-annotated parameter, runs. Before, it was refused at emit (`field access receiver is not a struct`). The callee's instance now reads the row the binding stores. Handed on with no in-place call it is still refused (D16160).
