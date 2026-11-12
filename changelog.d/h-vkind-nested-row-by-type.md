## Type system (Track A)

- **Step 7: a variant's nested-record field compares at the row its type finds.** `variantNestedRow` no longer reads the field's stored element name or interns its spelling a second time. Where a stored row is missing, it fails loudly; no program reaches that floor. Byte-identical over the sweep.
