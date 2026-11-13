## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono, R1 (a): three pin decisions read the type, not their text.** `monoRecordNominalPin` decides whether a record is spelled by its fields with a type walk instead of scanning its render. `monoTagRecordPinKind` asks for the stored type instead of comparing spellings. `monoSubstAnnNode`'s spelling comparison, which never fired, is deleted. All 2,515 programs that reach the three sites build byte-identical.
