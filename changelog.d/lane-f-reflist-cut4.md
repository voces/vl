## Type system (Track A)

- **A shape's ref-list field names its element by its type, and the name-based ref-list cluster is deleted (D15778 ruled type-first, step 7).** `refArrShapeKind`, `nameIsRefArray`, `refArrElemKind`, `refArrElemName`, their cache and `shapeElemDeclaredStructIdx` are gone (−444 lines). Type-string parses go 34 → 28 and the seed shrinks by 5.5 KB. Seven modules reorder their bytes at the same size, and no program changes output.
