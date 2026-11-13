## Type system (Track A)

- **Two record fields hold one element by their element types, not their element names (step 7, D6).** `fieldElemSame` no longer reads the name column, and `sigFieldMayMatch`'s name fallback, which no program reaches, is now a named internal error.
