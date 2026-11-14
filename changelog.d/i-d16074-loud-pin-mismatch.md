## Codegen, memory & runtime (Track B)

- **D16074 closed:** `monoInstanceFor` no longer builds nothing in silence when asked for an instance with fewer pinned types than parameters; that is now a named refusal, and its one caller skips a destination that names no parameters. Every program builds byte-identically.
