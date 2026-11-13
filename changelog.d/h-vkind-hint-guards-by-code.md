## Type system (Track A)

- **Step 7: a field's element-type hint is keyed on its code and type, not on whether an element name was recorded.** `fieldElemHintOf`, the anonymous-literal row and the shape interner's other-code recorder ask `fieldCodeHasElemRow`. An emptied element name no longer withholds the type. Byte-identical over the sweep.
