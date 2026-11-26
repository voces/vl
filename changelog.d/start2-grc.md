## Codegen, memory & runtime (Track B)

- **IR claims a read of a record global its initializer's call built at a declared twin's row:** the global's noted storage row is now the row its cell holds (`globalStoreTy`), agreeing with the cell's rep, and a read whose binding type is at another rep is read at that storage row, as legacy reads the cell. `global read coercion` falls 1 → 0: `functions/return-literal-twin-nested.vl` (`@start`), D17385's witness, is claimed; claimed and claims-off builds are byte-identical.
