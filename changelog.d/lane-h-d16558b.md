## Infrastructure (Track F)

- **D16558, the literal side:** a record literal's field lookup by name, the emitter's match of a literal against a struct layout, and the parser's duplicate-field check read a first-position name map past eight fields, instead of scanning. An annotated 1,600-field record literal compiles in 3.09G guest fuel, from 4.41G, on its own (with the type-side index, COMBINED), output byte-identical over the corpus.
