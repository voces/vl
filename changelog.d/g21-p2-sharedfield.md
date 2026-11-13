## Codegen, memory & runtime (Track B)

- **Step 7 (L6):** a shared variant field's box kind (`sharedFieldArmAtomKind`) is read from the field's type, not parsed from its text, so the variant field-text column has no reader left. No output moves.
