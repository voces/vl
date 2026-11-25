## Codegen, memory & runtime (Track B)

- IR coverage, `narrowed read niche kind` (lane COV-IS): a union-box local narrowed to a nullable map, list or closure is claimed as that reference's niche read. Over the programs the class held: tests/cases distinct functions claimed 114 → 143 of 153, witnesses 1 → 3 of 3.
- IR coverage, `is box not a local` (lane COV-IS): an `is` test over a module global's union box reads the global's cell raw, as legacy does, and is claimed. A captured box and an element receiver stay named misses.
