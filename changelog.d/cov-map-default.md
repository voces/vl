## Codegen, memory & runtime (Track B)

- **IR coverage: a map read's record default at a wider map row:** `m.get(k) ?? { … }` whose default literal is a declared record's own fields, read off a map of a wider record, is delivered at the read's row (`inlineDefault`), as the hit is held; the start bodies and functions that missed on `map read default rep` with a record default are claimed. Byte-identical to legacy.
