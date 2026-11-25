## Codegen, memory & runtime (Track B)

- IR coverage, closures in global initializers (lane COV-CLOS): a closure built in a module-scope value block (a labelled block or a value `if` in a global's initializer) over that block's own local is now claimed in the start body (D13081, D3383).
