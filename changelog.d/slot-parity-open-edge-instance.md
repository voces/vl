## Codegen, memory & runtime (Track B)

- **Slot store parity, open values:** a value the check left open (an un-annotated parameter) is copied, not shared, into the place it is written to when its instance types it a function, so a call through the parameter no longer reaches a list it seeded. Every `tests/cases` program builds byte-identical (D16768).
