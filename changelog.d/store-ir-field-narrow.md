## Codegen, memory & runtime (Track B)

- **IR: a field store through a narrowed union box:** `o.f = v` where `o` is a box local narrowed to one variant builds in the IR: the narrowed read, the value, and the variant's store tail, on `fieldStoreNarrowedAt`, the variant and field legacy's narrowed store now asks too. Byte-identical; the self-compile claims 53 more functions, and its `field store narrowVariant` blocker (59 functions alone) goes to 0.
