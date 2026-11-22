## Codegen, memory & runtime (Track B)

- **IR verifier: rule 2's global-read storage check reads a record the builder makes, not legacy's `letBindTy`** (D17049, the first edge retired). The builder notes each global's storage-row type beside its rep (`globalNoteAt` → `irGlobalStoreNote`), and a disagreeing second note is a named miss. Verifier self-test 27 pins the refusal.
