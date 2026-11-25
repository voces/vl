## Codegen, memory & runtime (Track B)

- **IR returns a record literal at its result's row** (return coercion, distilled `d15214_plain_inner`). A function returning `{ j: { f: 4 } }` beside a declared twin with a nullable record field (`K = { j: J | null }`) is built at the row legacy writes, the function's result row, at the result's own rep. Byte-identical. A nested literal at another rep of its row stays a named miss (`return coercion nested twin`).
