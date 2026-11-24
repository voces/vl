## Codegen, memory & runtime (Track B)

- **D17400, D17402 closed:** a record literal with no row of its own, such as `{ r: null }` beside the union arm `Circle = { r: i32 | null }` it narrows to, is stored as that arm when an un-annotated `Map()` holds it or a record field holds it. Both were loud emit rejects. The `rowless-record-narrowed-to-arm` matrix goes from 53 to 68 of 68 cells running.
