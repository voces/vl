## Codegen, memory & runtime (Track B)

- **IR builds a compare of a joined const atom (lane COV-UNION):** a `const` joining two const-bound literals, held as the joined set's atom, compared as a string (`M == A`, `"y" == M`, `M != B`, against a built string, in a closure) goes by the IR's own compare route. Before, the IR refused (`compare of a joined const atom`) only to keep legacy's string-compare locals byte for byte.
