## Codegen, memory & runtime (Track B)

- **Slot store parity, capture cells:** a closure's write to a captured binding reaches the binding's shared cell in the place classes, and a question asked at the cell's element is answered at the binding. Every `tests/cases` program builds byte-identical (D16768).
