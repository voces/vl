## Codegen, memory & runtime (Track B)

- **IR coverage: an `is` test whose receiver is a record field read at its storage** (`if z.h is A`
  over `h: A | B | C`) builds in the IR: the field read as its declared box, under the storage
  mark legacy's `emitIs` holds, then the tag test. Byte-identical.
