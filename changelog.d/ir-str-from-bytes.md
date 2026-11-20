## Codegen, memory & runtime (Track B)

- **IR coverage, `__str_from_bytes__`:** a byte-list-to-string call builds through the IR as a
  string op over its three operands, then the helper call legacy also writes
  (`strFromBytesTail`), on the routing legacy dispatches on (`strFromBytesCallNamed`). 337 more
  corpus functions are built by the IR. No emitted byte moves.
