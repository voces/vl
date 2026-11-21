## Codegen, memory & runtime (Track B)

- **IR: a record field's null is one Rhs kind**: `ROmitNull` (an omitted field) folds into `RFieldNull` (a typed `null` field), since both lower through `emitOmittedFieldNull`. Byte-identical.
