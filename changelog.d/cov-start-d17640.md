## Codegen, memory & runtime (Track B)

- D17640: a list literal of records that share a declared record's field names, with a function field of another signature (`type R = { v: i32, f: () => boolean }` beside `[{ v: 2, f: () => 11 }]`), builds and runs. It stopped at `ref valtype with no interned shape`; it now takes the list its own element type keys.
