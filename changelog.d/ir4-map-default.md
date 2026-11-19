## Codegen, memory & runtime (Track B)

- **IR re-entry, the `??` default's helper constant:** a map global read with an `i32` literal
  default (`g[k] ?? -1`) takes the helper route's miss constant from the literal itself
  (`mapDefaultI32Of`), shared by legacy and the IR, instead of writing the default into a scratch
  buffer through `emitExpr` and reading the constant back. No emitted byte moves.
