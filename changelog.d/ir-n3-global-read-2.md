## Codegen, memory & runtime (Track B)

- **IR coverage, `global read coercion` part 2:** an assignment whose value re-reads a literal-union global reads the cell's atom and decodes it to its string, and a global whose record type has no struct row is read at the row its initializer stored, which is also the storage row the verifier checks. In tests/cases, `start uncovered global read coercion` 18 → 9 and `uncovered global read coercion` 6 → 3; no legacy bytes moved.
