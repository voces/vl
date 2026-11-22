## Codegen, memory & runtime (Track B)

- **IR verifier: rule 2's global-read storage check reads a record the builder makes, not legacy's `letBindTy`** (D17049, the first edge retired). The builder notes each global's storage-row type beside its rep (`globalNoteAt` → `irGlobalStoreNote`), and a disagreeing second note is a named miss. Verifier self-tests 120 and 121 pin the refusal.
