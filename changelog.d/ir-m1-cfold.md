## Codegen, memory & runtime (Track B)

- **IR coverage: a folded constant's cell.** A module `const` whose initializer is an integer constant expression legacy folds (`letInitFoldsExpr`) gets its cell's value from the IR, the one `*.const` of the folded value (`constFoldOfLet`) that `emitConstFoldValue` writes, claimed and shadowed like any const cell (`const cell folded <kind>`).
