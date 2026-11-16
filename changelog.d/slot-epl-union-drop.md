## Codegen, memory & runtime (Track B)

- **Place classes keep linear memory:** a class merged into another drops its own member, call, up-link and child lists, which only the root is read through. Building the classes for every compile no longer runs the compiler's own self-compile out of GC heap; every `tests/cases` program builds byte-identical (D16768).
