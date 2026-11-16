## Infrastructure (Track F)

- **Nine AST walkers lose their depth caps** (type hash-cons stage 6b, batch 3):
  `ftWholeRecListLit`, `exitFirstOnSpine`, `rcwAllFresh`, `rcwExprText`, `objLitSigCountIn`,
  `nameInListLit`, `monoSubtreeNamesIdent`, `monoIdentAtPosIn` and `upeScalarOperand`. Each recurses
  only into a node's children, so it cannot meet a cycle, and none of the caps fired in the 6a
  census. Output and self-compile fuel are unchanged.
