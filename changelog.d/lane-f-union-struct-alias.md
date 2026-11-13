## Type system (Track A)

- **A union declaration's struct-alias test reads its members' types (step 7, D6).** `unionDeclStructAlias` asks whether every member resolves to one anonymous record type, instead of comparing member spellings and testing them for a brace shape. A member canon folded, such as an intersection of records, is decided by its type alone. An unfolded member keeps only a source-text check. `nameIsShapeSpanEnds`, `unionStructAliasShape` and `unionSoleDistinctVariant` are deleted. No behaviour change: all 24,224 sweep programs are byte-identical.
