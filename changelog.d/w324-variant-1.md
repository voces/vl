## Codegen, memory & runtime (Track B)

- **Step 7, variant name reads, cut 2:** a union member's arm, a declared union's arms against an existing row, an annotation's variant row and a variant field naming a declared record are asked by type; `annDeclVariantRow` takes no spelling and variant field collection parses no `| null` off a field's spelling. One module changes bytes, no output moves.
- **D15956 filed:** a held list literal of an arm-shaped anonymous record, returned, refuses its element's field read when no same-shape record is declared (loud emit reject).
