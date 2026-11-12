## Type system (Track A)

- **Step 7: a field stored as `null` is the null unit by its rep.** The field-row readers answer a `nulnone` storage rep as the `null` unit instead of asking the field code, which they asked because a hole's record was assumed to rep `nulnone` too. No field stores one. A hole's `null` as a storage type fails loudly. Byte-identical over the sweep.
