## Codegen, memory & runtime (Track B)

- **IR claims a union-typed record join bound un-annotated:** a value `if` over a union `is` test whose arms are records is built at its rep's own record row, the row legacy reads off the narrowed arm. `union if record join row` falls 3 → 0 units: `unions/union-if-record-join-unannotated-binding.vl` and D4645's witness are fully claimed. Claimed and claims-off builds are byte-identical.
