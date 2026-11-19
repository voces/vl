## Codegen, memory & runtime (Track B)

- **IR: a map is a value rep:** a map parameter, local or result no longer sends its function back to legacy; the IR passes the map as the reference legacy declares. Byte-identical; the self-compile claims 108 more functions and the distilled corpus 210.
