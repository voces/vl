## Codegen, memory & runtime (Track B)

- **IR claims a null test of a read the checker narrowed to `null`** (an `is string` else arm's `b == null`), legacy's folded constant, and a dropped `null` test of a field whose receiver's row is not decided at module scope.
