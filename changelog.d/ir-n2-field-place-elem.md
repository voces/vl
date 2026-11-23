## Codegen, memory & runtime (Track B)

- **IR coverage, `??` over a field of a re-read top-level receiver:** a list element read through a global or indexed by one, and a union global narrowed to its record arm, are read again on the present path as legacy re-emits them (start: coalesce field place 29 → 4 in tests/cases).
