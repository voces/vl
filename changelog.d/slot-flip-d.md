## Codegen, memory & runtime (Track B)

- **Slot store part D:** mono's slot delivery questions (pin types, per-instance pins, a lambda's delivered result) read the place classes instead of the delivery walk, and the classes are built once at elab end wherever the program takes a function as a value. Every `tests/cases` program but one (the D16801 mover) builds byte-identical (D16768).
