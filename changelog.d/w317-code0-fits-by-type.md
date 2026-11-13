## Codegen, memory & runtime (Track B)

- **Step 7 D6: the code-0 fit test reads the record's field types.** `code0SpellingFitsRow` decided whether a row's `i32`/`boolean` fields fit a query from the field spellings (`"i32"`, `"boolean"`). It is now `code0FieldsFitRow(ty, si)`, which reads each field's kind from the record type with `code0KindOf`. `anonHandleTyIx` no longer parses a pin's spelling to get its fields. Over the population every answer agrees, and all 182 programs that reach either caller build byte-identically.
