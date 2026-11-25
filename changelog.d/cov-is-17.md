## Codegen, memory & runtime (Track B)

- **IR claims a sentinel-nullable read narrowed to `null` and delivered into a scalar union** (`boolean | null`, `K | null` or `string | null` handed to an `i32 | null` or `f64 | null`), which writes the union's own null. On CENSUS's `null read storage rep` list, 9 of 10 `tests/cases` rows now match.
