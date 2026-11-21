## Codegen, memory & runtime (Track B)

- IR coverage: an `as!` over a type-parameter operand, and an `as?` over one at a pin where the cast can fail, are built by the IR as the exact numeric cast from the instance's pinned source (`asExprHolePinSrc`, `holeOptExactSrc`), the decision legacy's `emitHoleNumAsOpt` now reads too.
