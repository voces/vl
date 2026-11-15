## Type system (Track A)

- **D16570 fixed (stays runs):** a generic alias no longer types its declaration's shared field
  annotation node per application, so the node no longer depends on which instance ran last or on
  whether only quiet applications ran. `anyLitUnionUsed` reads an untyped field by its spelling.
  Byte-identical over 20,427 programs.
