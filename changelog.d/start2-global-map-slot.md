## Codegen, memory & runtime (Track B)

- The IR claims a `Map()` global whose values the checker builds at a wider record: the cell is held
  at that record's map, as a local's is, and its reads and value walks read it there.
