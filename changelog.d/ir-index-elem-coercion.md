## Codegen, memory & runtime (Track B)

- **IR coverage: two ref-list shapes.** A ref list's element read at a rep it stores as (`repStoresAs`, such as a closure of another signature) is the read at the element's storage, as legacy writes it. A union-box list literal that legacy builds element by element, rather than on a short arm (`arrLitUnionLongSlot`), boxes each element into the slot's union (`arrRefUnionElemTy`) through the IR's union-box writer.
