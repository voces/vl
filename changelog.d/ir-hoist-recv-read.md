## Codegen, memory & runtime (Track B)

- **IR coverage: a narrowed union global as a loop's hoisted receiver:** a union global narrowed by `is` (a string out of `string | IoError`, a list arm, a map arm) and read in a loop whose header hoists its receiver is read again from the global at each hoisted read (`irReadBoxed`, `boxNarrowBox`), as legacy re-reads the name; the functions and start bodies that missed on `hoisted receiver read` (e.g. `txt` in a `while` over `readTextFile`'s result at top level) are claimed. Byte-identical to legacy.
