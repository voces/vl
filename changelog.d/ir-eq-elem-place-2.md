## Codegen, memory & runtime (Track B)

- **IR coverage: a record compare whose element side's index is a global or a field read.** The
  index is re-read at each field as legacy's own root writes it. No legacy bytes moved.
