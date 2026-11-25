## Codegen, memory & runtime (Track B)

- **IR claims two more operand reads of a narrowed local:** a literal-union cell narrowed by an overlapping `is` set and read where a string is wanted (`"then " + J`), and a `let m = null` read inside an `if` join before a later write fills it with another record. On CENSUS's `narrowed read` list, 9 of 21 rows (4 programs) now match or move on to another class.
