## Codegen, memory & runtime (Track B)

- **D16728 closed:** a `string | null` field shared by a record union's arms, read after a member null test, delivers the non-null string into every string slot instead of building invalid wasm. Every nullable read, `string | null` included, now recovers by one rule (`readOwesNonNullRecover`); the string-only recoveries at field, local, capture and global reads are deleted.
