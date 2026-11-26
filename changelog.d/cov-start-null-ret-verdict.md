## Codegen, memory & runtime (Track B)

- Functions: an un-annotated function returning a record or `null` whose record holds an un-annotated function (`return if b { { f: half } } else { null }`) builds its `null` at the record's nullable row; it refused as `a union's value-box verdict is read off neither its member set nor its type` before (D17170).
