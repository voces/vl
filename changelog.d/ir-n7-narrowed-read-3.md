## Codegen, memory & runtime (Track B)

- **IR coverage (lane IR-N7):** the `narrowed read` remainder: an assignment used as a value re-reads a local atom cell, a nullable local narrowed to `null` reads its cell, and a string narrowed by `is` to a literal set reads as its string (`narrowed read` 26 → 10 on tests/cases), byte-identical to legacy.
