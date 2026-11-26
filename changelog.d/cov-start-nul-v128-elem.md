## Codegen, memory & runtime (Track B)

- IR coverage (lane COV-START): a cell of a list of nullable vectors read past its null (`xs[i] ?? splatF32(0.0)`, or `xs[i]` after `if xs[i] != null`) is built by the IR, unboxed to the vector as legacy unboxes it. The unbox's kind table had read the vector's appended kind as a list kind.
