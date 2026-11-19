## Codegen, memory & runtime (Track B)

- **IR function values, step 1:** the IR builds a closure-holding local or parameter, a capture-free function value (`RMakeClo`), and a call through a closure binding (`RCallRef`) where legacy writes the plain `call_indirect` (`callRefPlainKey`). A direct call passes a nested callee's null environment and a lifted callee's parameter captures, and a lifted lambda's `const`, a nested function declaration and a bare function name write nothing. Byte-identical; 462 more distilled functions and 37 more of the compiler's own ship from the IR.
