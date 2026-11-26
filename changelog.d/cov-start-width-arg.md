## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): a record literal stored at a declared type's row, passed where a narrower record is wanted (`type W = { y: i32, x: boolean }` and then `getX({ y: 5, x: true })`), is built by the IR. It goes in as it stands, at the wasm supertype legacy declares for the narrower row.
