## Type system (Track A)

- **Step 7: `wasmEmit`'s field-element readers decide by the element's type.** The union-box `==` columns read a union's arms only from its type. A variant's nested-record row is found by type again; #7686 had reverted it. The comparable and struct-equality gates test the element type rather than the element name. Byte-identical over the sweep, unarmed and with `$VL_OPAQUE_SNAMES=1`.
