## Codegen, memory & runtime (Track B)

- **IR coverage: a record compare whose element side reads a global or field-read list.** The
  receiver is re-read at each field as legacy's own root reads it, and its element-read rows are
  banked. No legacy bytes moved.
