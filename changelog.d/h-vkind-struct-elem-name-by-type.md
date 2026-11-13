## Type system (Track A)

- **Step 7: a nested-record field with no struct row yet records its type's nominal name.** `fieldRefElemName`'s FC_STRUCT arm used to strip the annotation's spelling to its non-null base. It now names the field's non-null type, with a loud floor for a field with no type. Byte-identical over the sweep, unarmed and with `$VL_OPAQUE_SNAMES=1`.
