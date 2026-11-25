## Codegen, memory & runtime (Track B)

- IR coverage, `is box not a local` (lane COV-IS): an `is` test over a module global's union box reads the global's cell raw, as legacy does, and is claimed. A captured box (COV-CLOS) and an element receiver stay named misses.
