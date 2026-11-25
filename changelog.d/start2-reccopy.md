## Codegen, memory & runtime (Track B)

- **IR claims a record copied into a union's variant row:** `m.get(k) ?? d`, where the map holds an unannotated record and `d` its annotated twin (D15314), copies the record into the union's variant row through legacy's copy tail, as it already did for a struct row. `pre-path coercion recCopy variant` falls 6 → 0 on its programs, with bytes identical claims-off.
