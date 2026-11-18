## Codegen, memory & runtime (Track B)

- **Union `==` has one compare, shared with the IR:** every value-union `==`/`!=` evaluates each operand once and runs the staged compare (`unionUnionEqTail`); the arm-by-arm re-read chain and `emitUnionUnionNumCross` are deleted, and the IR claims union-against-union compares (`RUnionEq`) through the same tail.
