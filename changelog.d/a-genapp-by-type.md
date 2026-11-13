## Type system (Track A)

- **The emitter's generic-alias gates ask the node and the type, not a spelling (step 7, P4).** `collectAnnShapes` and `collectNestedFieldShapes` test whether an annotation's declared or recorded type mentions a generic-alias parameter (`annMentionsGaParam`); `nameMentionsGenAliasParam` and the write-only `gaeParams` are deleted. `gaeCollectDecls`, `typeDeclMintsRow` and the nested-field owner test read the declaration's parameters off the parser's node record (`declGpBaseOf`/`declGpParamsOf`). The render-parse ratchet falls 69 → 65 render and 25 → 19 source parses.
