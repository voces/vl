## Codegen, memory & runtime (Track B)

- **IR coverage (lane IR-N7):** a box's null test and a seated box read on the `??` desugar (`narrowed read` 21 → 14 on tests/cases), and a string part that is not a literal-union atom at any rep (`string atom part route` 24 → 8), byte-identical to legacy.
