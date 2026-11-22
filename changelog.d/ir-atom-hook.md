## Codegen, memory & runtime (Track B)

- **IR coverage: an `else if` chain of member literals at a literal-union destination.** A direct link at a destination's type is written along the chain's spine with no `emitExpr` prelude, as legacy's `emitIfExprAsLink` writes it, so the atom hook no longer stops the chain.
