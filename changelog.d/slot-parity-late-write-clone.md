## Codegen, memory & runtime (Track B)

- **Slot store parity, cloned capture writes:** an instance's clone of the temp a closure's write to a captured binding goes through answers as the binding's shared cell in the place classes, as the temp itself does. Every `tests/cases` program builds byte-identical (D16768).
