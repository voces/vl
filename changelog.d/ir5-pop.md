## Codegen, memory & runtime (Track B)

- **IR `emitExpr` re-entries retired: `popDropTail` and `emitStaticLitAtom`.** A numeric `.pop()` statement's take-and-drop writes over its local through an index-free half; an atom compare's static side that is not a literal is built by the IR and dropped, with the id written from the member lexeme.
