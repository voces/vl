## Codegen, memory & runtime (Track B)

- **IR coverage: a cell at its storage row where its initializer builds it.** A module global
  whose initializer builds the storage row legacy lays its cell out from (D14434's binding
  column) stores it there, and that build's reads of the global take it as it is. A local
  declaration does the same. The verifier holds such a read to that column.
