## Codegen, memory & runtime (Track B)

- **Step 7 L2, mono, P6: `monoUnspacedUnions` is deleted.** `monoListSpelling` reparsed the spelling the pin speller had just produced in order to unspace its unions, but the speller never puts spaces in a union. The reparse changed nothing on any of its 103 decisions across the population, and all 72 programs that reach it build byte-identical.
