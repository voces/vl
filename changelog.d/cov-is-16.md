## Codegen, memory & runtime (Track B)

- **IR claims a read of a record type with no struct row of its own, where legacy holds it at another record's row** (a callback's `y: { f: null }` over a list built at `J = { f: i32 | null }`, handed to a `{ f: null }` parameter, or a module loop's element). On CENSUS's `narrowed read` list, 6 of the 7 record rows now match.
