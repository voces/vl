## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono: the tagged-set stored-type speller answers the type.** `monoTagMapRepName` becomes `monoTagMapRepTy`, which returns the arena type a map of tagged-set ids, or a record holding one, is stored at (-1 where it used to answer `""`). Its callers spell that type, which gives the same spellings. Lane F's ref-list mint reads the type directly. No behaviour change.
