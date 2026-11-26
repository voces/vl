## Codegen, memory & runtime (Track B)

- **IR claims a name narrowed to `null` bound to a fresh name:** `else { const z = q }` after `if q is Rec`, for a module global or a local, whose storage read is that null. The global's seated read takes the cell as it stands, and at the `null` unit the storage read is handed back so the binding takes it at its storage row, as legacy declares that local.
