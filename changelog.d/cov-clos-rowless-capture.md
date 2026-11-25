## Codegen, memory & runtime (Track B)

- IR coverage, rowless record captures (lane COV-CLOS): a closure in a module block that captures a binding of a record type with no struct row of its own (`J` built only as another function's `{ f: null }`) is now claimed. The environment slot takes the binding's own storage row, as legacy declares it.
